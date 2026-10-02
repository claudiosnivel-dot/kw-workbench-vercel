# 15-workspaces — Macrotask `workspaces`

> Porta i progetti dall'utente singolo (`projects.owner_user_id`) a workspace di team con ruoli OWNER/ADMIN/MEMBER (D-08); nasce dai rilievi dell'audit 2026-10-02 su isolamento basato solo su `owner_user_id`, progetti orfani invisibili (`owner_user_id` nullable) e scritture check-then-update per solo id.

## Obiettivo del macrotask
Oggi ogni query di progetti, sezioni, risultati, export, job e onboarding filtra per `owner_user_id: user.id` (oltre 30 occorrenze in `app/**` e in `lib/onboarding/progress.ts`), e diverse rotte controllano la proprietà con un `findFirst` e poi scrivono con `update({ where: { id } })`. Il macrotask introduce Workspace e Membership, sposta la proprietà dei progetti sul workspace con una migrazione che conserva i dati (D-05), centralizza l'autorizzazione per ruolo in `lib/authz/` con una sola tabella di permessi (D-08) e aggiunge inviti, gestione membri, selettore del workspace attivo e pagina impostazioni. L'isolamento resta applicativo (D-02): ogni accesso passa dalla membership e ogni scrittura porta il perimetro del workspace nel `where`.

## Task atomici

```yaml
- id: T-1501
  title: "Modello workspace e membership"
  macrotask: "workspaces"
  depends_on: [T-1401, T-1103]

  objective: >
    Introdurre le entità Workspace e Membership e spostare la proprietà dei progetti
    dall'utente al workspace: projects.workspace_id NOT NULL sostituisce owner_user_id,
    ogni utente riceve un workspace personale alla registrazione e la migrazione sposta
    i progetti esistenti nel workspace personale del vecchio proprietario, lasciando
    invariato il comportamento osservabile (ognuno vede solo i propri progetti).

  definition_of_done:
    - "prisma/schema.prisma: enum WorkspaceRole con valori OWNER, ADMIN, MEMBER; model Workspace (id, name, slug @unique, personal_for_user_id String? @unique con FK verso users onDelete Cascade, created_at, updated_at) mappato su workspaces; model Membership (id, workspace_id, user_id, role WorkspaceRole, created_at, @@unique([workspace_id, user_id]), @@index([user_id]), FK onDelete Cascade su entrambe le colonne) mappato su memberships."
    - "Project: workspace_id String obbligatorio (FK workspaces onDelete Cascade, @@index([workspace_id])) e created_by_user_id String? (FK users onDelete SetNull); rimossi owner_user_id, la relazione owner e @@index([owner_user_id]); la relazione User.projects diventa created_projects."
    - "Migrazione SQL unica in prisma/migrations/<timestamp>_workspaces/migration.sql: crea le tabelle, inserisce per ogni riga di users un workspace personale (id gen_random_uuid()::text, name = display_name introdotto da T-1401, slug derivato dall'id e univoco) e una Membership OWNER, valorizza projects.workspace_id con il workspace personale di owner_user_id e created_by_user_id = owner_user_id, poi rende workspace_id NOT NULL ed elimina owner_user_id (D-05: migrazione drastica ammessa)."
    - "Progetti orfani (owner_user_id NULL, oggi invisibili a chiunque): assegnati al workspace personale del root admin (is_root_admin = true); se users è vuota vengono eliminati; la migrazione emette con RAISE NOTICE il numero di progetti riassegnati ed eliminati."
    - "Registrazione: la funzione che crea l'utente (registerUser in lib/auth/credentials.ts, come modificata da T-1401) crea utente, workspace personale e Membership OWNER in una sola prisma.$transaction; createUserFromAdmin (lib/admin/users.ts) passa dalla stessa funzione; assignOrphanDataToUser e ogni altro riferimento a owner_user_id vengono rimossi."
    - "Filtro transitorio: nuovo modulo lib/authz/workspace.ts con projectAccessWhere(userId) che restituisce il filtro Prisma workspace.memberships.some.user_id = userId; tutte le occorrenze attuali di owner_user_id (rotte in app/api/projects/**, pagine app/page.tsx e app/projects/**, lib/onboarding/progress.ts) lo usano. POST /api/projects crea nel workspace personale dell'utente con created_by_user_id = user.id. Ruoli, permessi e workspace attivo arrivano con T-1502 e T-1504."
    - "Le nuove tabelle workspaces e memberships hanno RLS abilitata senza policy come le altre tabelle app (T-205, D-20)."
    - "Il test di migrazione usa un database temporaneo sul Postgres di test: applica le migrazioni fino a quella precedente, inserisce dati legacy, applica la migrazione workspace e verifica; helper riusabile in tests/helpers/migrations.ts."
    - "Le caratterizzazioni di T-105 (tests/integration/characterization/projects-authz.char.test.ts) restano verdi senza modificarne le asserzioni."

  acceptance_criteria:
    - id: AC-1501-1
      given: "un database allo schema precedente con utente A (2 progetti), utente B (1 progetto), un root admin e 1 progetto con owner_user_id NULL"
      when: "si applica la migrazione workspace"
      then: "workspaces contiene 1 riga per utente con personal_for_user_id valorizzato; memberships contiene 1 riga OWNER per utente; i progetti di A hanno workspace_id uguale al workspace personale di A e created_by_user_id = A; il progetto orfano ha workspace_id uguale al workspace personale del root admin; information_schema.columns non contiene la colonna projects.owner_user_id"
    - id: AC-1501-2
      given: "un database migrato senza l'utente 'nuovo@example.com'"
      when: "si registra 'nuovo@example.com' tramite POST /api/auth/register"
      then: "esistono esattamente 1 workspace con personal_for_user_id = id del nuovo utente e 1 Membership con role OWNER che li collega"
    - id: AC-1501-3
      given: "la creazione del workspace personale forzata a lanciare un errore dentro la transazione (mock)"
      when: "si chiama la funzione di registrazione"
      then: "la chiamata termina con errore e users, workspaces e memberships hanno lo stesso numero di righe di prima"
    - id: AC-1501-4
      given: "utente A con progetto P nel suo workspace personale e utente B senza membership in quel workspace"
      when: "B invia GET, PATCH e DELETE a /api/projects/{P} e A invia POST /api/projects"
      then: "le tre richieste di B ricevono 404 e P ha lo stesso updated_at; il progetto creato da A ha workspace_id uguale al workspace personale di A e created_by_user_id = A; un secondo insert di Membership con la stessa coppia (workspace_id, user_id) fallisce con P2002"

  target_tests:
    - file: "tests/integration/workspace-model.test.ts"
      covers: [AC-1501-1, AC-1501-2, AC-1501-3, AC-1501-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (Authorization Bypass Through User-Controlled Key): ogni lettura o scrittura di progetti, sezioni, risultati e job passa da projectAccessWhere(user.id); nessuna query sui progetti filtra solo per l'id ricevuto dall'URL."
    - "A01 / CWE-284: l'isolamento è applicativo (D-02, ecosistema postgres-jsts); le nuove tabelle nascono con RLS deny-by-default come previsto da T-205, così la Data API di Supabase non le espone."
    - "A10 Mishandling of Exceptional Conditions / CWE-460 (Improper Cleanup on Thrown Exception): utente, workspace e membership nella stessa transazione; un errore a metà non lascia utenti senza workspace (vedrebbero 0 progetti e non potrebbero crearne)."
    - "A01 / CWE-284 (Improper Access Control): i progetti orfani diventano visibili al root admin; è ammesso solo perché D-05 dichiara di test i dati di produzione, e la riassegnazione è conteggiata con RAISE NOTICE, mai silenziosa."

  out_of_scope:
    - "Ruoli, tabella dei permessi e requireWorkspaceRole sulle rotte: T-1502."
    - "Inviti e gestione membri: T-1503."
    - "Workspace attivo, selettore e pagina impostazioni: T-1504."

- id: T-1502
  title: "Autorizzazione per workspace su tutte le rotte"
  macrotask: "workspaces"
  depends_on: [T-1501, T-1204]

  objective: >
    Sostituire il filtro transitorio con un'autorizzazione per workspace e ruolo applicata
    a tutte le rotte e pagine di progetti, sezioni, risultati, export, job e onboarding,
    con una sola tabella dei permessi derivata da D-08 e scritture che portano sempre il
    perimetro del workspace nel where, eliminando i pattern check-then-update per solo id.

  definition_of_done:
    - "lib/authz/permissions.ts: tabella unica WORKSPACE_PERMISSIONS che associa ogni azione al ruolo minimo secondo D-08: project.read, project.update, section.write, extraction.run, export.run → MEMBER; project.delete, members.manage → ADMIN; billing.manage, workspace.delete → OWNER. L'eliminazione di sezioni ricade in section.write (D-08 vieta a MEMBER solo l'eliminazione di progetti); cambiare questa scelta tocca solo la tabella."
    - "lib/authz/workspace.ts: requireWorkspaceRole(user, workspaceId, action) e requireProjectAccess(user, projectId, action) leggono risorsa e membership con UNA query (project.findFirst con id e workspace.memberships.some.user_id) e lanciano AppError di T-503: 404 code NOT_FOUND se la risorsa non esiste o l'utente non è membro, 403 code FORBIDDEN se il ruolo non basta; getCurrentWorkspace(user, requestedId?) restituisce il workspace richiesto se l'utente ne è membro, altrimenti il workspace personale (T-1504 vi aggiunge il cookie)."
    - "Rotte migrate (quelle ancora presenti al momento del task, perché T-1101 può aver rimosso alcune GET): app/api/projects (GET; POST con workspaceId opzionale nel body, validato con requireWorkspaceRole), projects/[id] (GET, PATCH, DELETE), [id]/default-subproject (PATCH), [id]/export (GET), [id]/export/google-sheets (POST), [id]/results (GET, PATCH), [id]/run (POST), [id]/subprojects (GET, POST), [id]/subprojects/[subprojectId] (GET, PATCH, DELETE), [id]/subprojects/[subprojectId]/run (POST), [id]/subprojects/reorder (PATCH), app/api/jobs/[id] e app/api/jobs/[id]/cancel di T-1204, app/api/onboarding/state, choice, resume, skip."
    - "Pagine migrate: app/page.tsx, app/projects/new, app/projects/[id] con results, sections, settings e subprojects/[subprojectId], app/onboarding/**: un non membro riceve notFound() (pagina 404) e nessun dato."
    - "Scritture senza TOCTOU: ogni update/delete di project, subproject, seed, keywordCandidate e job include il perimetro del workspace nel where (where con id e workspace_id per projects; updateMany/deleteMany con filtro project.workspace_id e controllo count === 1, altrimenti 404). Eliminati i check-then-update per solo id oggi presenti in app/api/projects/[id]/route.ts (PATCH, DELETE), subprojects/[subprojectId]/route.ts (PATCH, DELETE), subprojects/reorder/route.ts e default-subproject/route.ts."
    - "lib/onboarding/progress.ts: findOwnedProject, findFallbackProject, findOwnedSubproject e computeState limitati ai workspace dell'utente; un active_project_id fuori perimetro viene ignorato."
    - "Matrice di test su ogni rotta elencata per 4 attori (non membro, MEMBER, ADMIN, OWNER) con l'esito atteso calcolato dalla tabella dei permessi, non riscritto a mano nel test."

  acceptance_criteria:
    - id: AC-1502-1
      given: "workspace W con progetto P, sezione S e job J, e un utente U senza membership in W"
      when: "U invoca ciascuna rotta elencata nel DoD con gli id di P, S e J"
      then: "ogni risposta ha status 404 con code NOT_FOUND e numero di righe e updated_at di projects, subprojects, seeds, keyword_candidates e jobs di W restano identici"
    - id: AC-1502-2
      given: "un MEMBER e un ADMIN di W con progetto P"
      when: "il MEMBER invia PATCH /api/projects/{P}, POST /api/projects/{P}/run, GET /api/projects/{P}/export e DELETE /api/projects/{P}, poi l'ADMIN invia DELETE /api/projects/{P}"
      then: "le prime tre richieste del MEMBER ricevono 200 o 202; il DELETE del MEMBER riceve 403 con code FORBIDDEN e P esiste ancora; il DELETE dell'ADMIN riceve 200 e projects non contiene più P"
    - id: AC-1502-3
      given: "un utente membro di W1 con progetto P1 e non membro di W2, che contiene il progetto P2 con sezione S2 e keyword K2"
      when: "l'utente invia PATCH /api/projects/{P1}/subprojects/{S2}, PATCH /api/projects/{P1}/default-subproject con subprojectId S2 e PATCH /api/projects/{P1}/results con ids [K2]"
      then: "le prime due richieste ricevono 404, la terza aggiorna 0 righe; S2, P1.default_subproject_id e review_status di K2 restano invariati"
    - id: AC-1502-4
      given: "il codice di app/api/** e lib/**"
      when: "tests/tooling/workspace-scoped-writes.test.ts analizza le chiamate prisma update, delete, updateMany e deleteMany sui modelli project, subproject, seed, keywordCandidate e job"
      then: "il numero di chiamate con un where composto dal solo id, senza workspace_id né filtro sul progetto del workspace, è 0"

  target_tests:
    - file: "tests/integration/workspace-authz-matrix.test.ts"
      covers: [AC-1502-1, AC-1502-2, AC-1502-3]
    - file: "tests/tooling/workspace-scoped-writes.test.ts"
      covers: [AC-1502-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (Authorization Bypass Through User-Controlled Key): ogni rotta risolve l'accesso con requireProjectAccess o requireWorkspaceRole sul workspace della risorsa, mai sull'id del client senza membership."
    - "A01 / CWE-367 (Time-of-check Time-of-use Race Condition): update e delete includono il perimetro del workspace nel where; una membership revocata tra controllo e scrittura non porta a una scrittura."
    - "A01 / CWE-203 (Observable Discrepancy): il non membro riceve un 404 identico a quello di una risorsa inesistente; il 403 è riservato a chi è membro con ruolo insufficiente."
    - "A01 / CWE-285 (Improper Authorization): i permessi per ruolo stanno in un'unica tabella testata; nessun controllo di ruolo duplicato inline nelle rotte."

  out_of_scope:
    - "Inviti, ruoli dei membri e trasferimento di proprietà: T-1503."
    - "Workspace attivo da cookie e selettore in TopNav: T-1504."
    - "Limiti del piano (402 PLAN_LIMIT): T-1605."

- id: T-1503
  title: "Inviti e gestione dei membri"
  macrotask: "workspaces"
  depends_on: [T-1502, T-1402, T-1403]

  objective: >
    Permettere ad ADMIN e OWNER di invitare persone via email con un ruolo, di revocare
    inviti, cambiare ruolo e rimuovere membri, e ai membri di abbandonare un workspace;
    l'OWNER può trasferire la proprietà. L'accettazione è legata all'identità verificata
    del destinatario e un workspace non resta mai senza OWNER.

  definition_of_done:
    - "prisma/schema.prisma: model WorkspaceInvite (id, workspace_id FK onDelete Cascade, email normalizzata lowercase, role WorkspaceRole limitato ad ADMIN o MEMBER, token_hash String @unique, invited_by_user_id, expires_at, accepted_at?, revoked_at?, created_at, @@index([workspace_id]), @@index([email])) mappato su workspace_invites, con RLS abilitata senza policy (T-205)."
    - "Token: 32 byte da crypto.randomBytes codificati base64url, salvati solo come SHA-256 esadecimale; scadenza 7 giorni da created_at; il token in chiaro compare solo nel link dell'email (template invito di T-1402, nella lingua di chi invita) e mai nella risposta API né nei log, dove si scrive solo l'id dell'invito."
    - "API con permessi da lib/authz/permissions.ts (members.manage = ADMIN o superiore): POST /api/workspaces/[workspaceId]/invites con email e role → 201 con id, email, role, expiresAt; 409 code INVITE_PENDING se esiste già un invito pendente per la stessa email; 409 code ALREADY_MEMBER se l'email appartiene a un membro; DELETE /api/workspaces/[workspaceId]/invites/[inviteId] imposta revoked_at."
    - "Accettazione: pagina /invites/accept?token=... (anonimo → redirect a /login con next che conserva il token) e POST /api/invites/accept con token: richiede utente loggato con email uguale (case-insensitive) e email_verified_at non nullo; crea la Membership e imposta accepted_at nella stessa transazione con UPDATE condizionato (accepted_at IS NULL, revoked_at IS NULL, expires_at maggiore di now()), così il token è monouso anche con richieste concorrenti."
    - "Esiti dell'accettazione: token sconosciuto, scaduto, revocato o già usato → 410 code INVITE_INVALID (stessa risposta per tutti i casi); email diversa → 403 code INVITE_EMAIL_MISMATCH; email non verificata → 403 code EMAIL_NOT_VERIFIED. La verifica email è di T-1403, non presente nelle dipendenze: se T-1403 non è ancora costruito nessun utente risulta verificato e l'accettazione resta bloccata (dipendenza implicita segnalata nel Self-check)."
    - "Membri: PATCH /api/workspaces/[workspaceId]/members/[userId] con role ADMIN o MEMBER (ADMIN o superiore; un ADMIN non modifica né rimuove un OWNER); DELETE /api/workspaces/[workspaceId]/members/[userId]; POST /api/workspaces/[workspaceId]/leave; POST /api/workspaces/[workspaceId]/transfer con userId, solo OWNER: il destinatario, già membro, diventa OWNER e il cedente ADMIN nella stessa transazione."
    - "Invariante ultimo OWNER: rimozione, abbandono o declassamento che lascerebbero il workspace senza OWNER → 409 code LAST_OWNER; controllo e scrittura nella stessa transazione con lock della riga del workspace (SELECT ... FOR UPDATE). L'OWNER non può abbandonare il proprio workspace personale (409 code LAST_OWNER)."
    - "Seats: se T-1605 è già costruito, creazione e accettazione di un invito chiamano assertSeatAvailable di lib/billing/enforce.ts; altrimenti l'aggancio è a carico di T-1605."

  acceptance_criteria:
    - id: AC-1503-1
      given: "un ADMIN e un MEMBER del workspace W e l'outbox email di test vuota"
      when: "l'ADMIN invia POST /api/workspaces/{W}/invites con email 'Nuovo@Example.com' e role MEMBER, poi il MEMBER invia la stessa richiesta per 'altro@example.com'"
      then: "la prima risposta è 201 senza campo token; workspace_invites contiene 1 riga con email 'nuovo@example.com', token_hash di 64 caratteri esadecimali ed expires_at = created_at + 7 giorni; l'outbox contiene 1 email verso quell'indirizzo con un link il cui token ha SHA-256 uguale a token_hash; la richiesta del MEMBER riceve 403 e non crea righe"
    - id: AC-1503-2
      given: "un invito valido per 'nuovo@example.com' e un utente loggato con quella email verificata"
      when: "l'utente invia due volte POST /api/invites/accept con lo stesso token"
      then: "la prima risposta è 200 e crea 1 Membership con il ruolo dell'invito e accepted_at valorizzato; la seconda risposta è 410 con code INVITE_INVALID e memberships contiene ancora 1 sola riga per quell'utente in W"
    - id: AC-1503-3
      given: "un invito valido per 'nuovo@example.com', un invito scaduto e un invito revocato per lo stesso destinatario"
      when: "un utente verificato 'altro@example.com' accetta il primo e il destinatario verificato accetta gli altri due"
      then: "le risposte sono rispettivamente 403 INVITE_EMAIL_MISMATCH, 410 INVITE_INVALID e 410 INVITE_INVALID e memberships non riceve nuove righe"
    - id: AC-1503-4
      given: "W con un solo OWNER e un MEMBER M"
      when: "l'OWNER invia POST /leave, poi POST /transfer verso M, poi di nuovo POST /leave"
      then: "il primo leave risponde 409 con code LAST_OWNER e la membership resta; il transfer risponde 200 con M OWNER e il cedente ADMIN; il secondo leave risponde 200 e W ha esattamente 1 OWNER"

  target_tests:
    - file: "tests/integration/workspace-invites.test.ts"
      covers: [AC-1503-1, AC-1503-2, AC-1503-3, AC-1503-4]

  security_notes:
    - "A04 Cryptographic Failures / CWE-330 (Use of Insufficiently Random Values) e CWE-312 (Cleartext Storage of Sensitive Information): token da 32 byte di crypto.randomBytes salvato solo come hash SHA-256; un dump del DB non permette di accettare inviti."
    - "A01 Broken Access Control / CWE-285 (Improper Authorization): l'accettazione richiede l'identità verificata del destinatario, non il solo possesso del link; gestione membri riservata ad ADMIN o superiore, trasferimento solo all'OWNER."
    - "A07 Authentication Failures / CWE-613 (Insufficient Session Expiration): scadenza 7 giorni e uso singolo con UPDATE condizionato; 410 identico per token inesistente, scaduto, revocato o usato, senza rivelarne lo stato."
    - "A06 Insecure Design / CWE-362 (Race Condition): invariante ultimo OWNER verificata in transazione con lock della riga workspace."
    - "A09 Security Logging and Alerting Failures / CWE-532 (Insertion of Sensitive Information into Log File): il token non compare mai in log o risposte; si logga solo l'id dell'invito."

  out_of_scope:
    - "Interfaccia di gestione membri e inviti: T-1504."
    - "Limite seats del piano: T-1605."
    - "Verifica dell'email: T-1403."

- id: T-1504
  title: "Selettore di workspace e impostazioni del workspace"
  macrotask: "workspaces"
  depends_on: [T-1502, T-1302, T-1503]

  objective: >
    Rendere il workspace una scelta visibile: workspace attivo memorizzato in un cookie
    e riverificato lato server, selettore nella TopNav, dashboard e creazione progetto sul
    workspace attivo, e una pagina impostazioni con nome, membri e ruoli; la credenziale
    Google Sheets resta personale.

  definition_of_done:
    - "Workspace attivo: cookie kwb_workspace (httpOnly, SameSite=Lax, Secure secondo shouldUseSecureCookies di lib/auth/config.ts, path /) con l'id del workspace; getCurrentWorkspace di lib/authz/workspace.ts lo legge e verifica la membership a ogni richiesta; cookie assente, malformato o di un workspace non più accessibile → workspace personale e cookie riscritto."
    - "API: GET /api/workspaces → workspace dell'utente con id, name, role, isPersonal; POST /api/workspaces/active con workspaceId → 404 se non membro, altrimenti imposta il cookie e risponde 204; PATCH /api/workspaces/[workspaceId] con name (1-80 caratteri, ADMIN o superiore)."
    - "components/top-nav.tsx: selettore del workspace accessibile (select o listbox con aria-label) alimentato da app/layout.tsx con elenco workspace e workspace attivo; al cambio chiama POST /api/workspaces/active e poi router.refresh(); non mostrato sulle route di autenticazione (isAuthRoute)."
    - "Dashboard (app/page.tsx), app/projects/new, POST /api/projects senza workspaceId e onboarding usano il workspace attivo."
    - "Pagina /workspace (app/workspace/page.tsx): nome modificabile, elenco membri con ruolo e data di ingresso, inviti pendenti; i controlli sono resi solo ai ruoli ammessi dalla tabella dei permessi di T-1502 (la verifica resta lato server). I controlli di invito, revoca, cambio ruolo, rimozione, abbandono e trasferimento usano le API di T-1503: se T-1503 non è ancora costruito non vengono resi e li aggiunge T-1503 (dipendenza implicita segnalata nel Self-check)."
    - "La pagina dichiara con un testo informativo che l'export su Google Sheets usa la connessione OAuth personale di chi esporta (GoogleSheetsCredential resta per utente)."
    - "Stringhe nei cataloghi messages/it.json e messages/en.json (T-1302); tests/unit/no-hardcoded-strings.test.ts e tests/unit/i18n-catalog-parity.test.ts restano verdi."

  acceptance_criteria:
    - id: AC-1504-1
      given: "un utente membro di W1 (progetto P1) e di W2 (progetto P2) con W1 attivo"
      when: "sceglie W2 nel selettore della TopNav e poi ricarica la pagina"
      then: "la dashboard elenca P2 e non P1 sia subito dopo la scelta sia dopo il reload, e il selettore ha W2 come valore selezionato"
    - id: AC-1504-2
      given: "un cookie kwb_workspace impostato a mano con l'id di un workspace di cui l'utente non è membro"
      when: "l'utente apre la dashboard"
      then: "la dashboard elenca i progetti del workspace personale e la risposta contiene Set-Cookie kwb_workspace con l'id del workspace personale"
    - id: AC-1504-3
      given: "un MEMBER e un ADMIN del workspace W"
      when: "entrambi aprono /workspace e l'ADMIN rinomina W in 'Team SEO'"
      then: "il MEMBER vede l'elenco membri con i ruoli, il campo nome con attributo disabled e 0 pulsanti di rimozione; dopo il salvataggio dell'ADMIN il selettore della TopNav mostra 'Team SEO'"
    - id: AC-1504-4
      given: "un utente non membro di W2 che conosce l'URL /projects/{P2}"
      when: "apre l'URL nel browser"
      then: "la risposta HTTP della pagina ha status 404 e il nome di P2 non compare nel DOM"

  target_tests:
    - file: "tests/e2e/workspace-switch.spec.ts"
      covers: [AC-1504-1, AC-1504-2, AC-1504-3, AC-1504-4]

  security_notes:
    - "A01 Broken Access Control / CWE-565 (Reliance on Cookies without Validation and Integrity Checking): kwb_workspace è solo una preferenza; la membership viene riverificata lato server a ogni richiesta e un id manomesso ricade sul workspace personale."
    - "A01 / CWE-639 (Authorization Bypass Through User-Controlled Key): GET e PATCH dei workspace filtrano per membership; nascondere i controlli in UI non sostituisce requireWorkspaceRole."

  out_of_scope:
    - "Logica server di inviti e membri: T-1503."
    - "Pagina di fatturazione del workspace: T-1604."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
- Dipendenze implicite da confermare nel 00-INDEX: T-1503 richiede utenti con email verificata (T-1403, non tra le dipendenze); T-1504 rende i controlli di gestione membri solo se T-1503 è costruito; seats (T-1605) agganciati agli inviti da chi arriva per secondo tra T-1503 e T-1605.
