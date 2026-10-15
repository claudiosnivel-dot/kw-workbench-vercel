# 34-ux-admin-users — Macrotask `ux-admin-users`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 7 di 7: la scheda dell'utente, il cambio dell'email da parte del root admin e l'elenco dei workspace della piattaforma (funzioni M1, M3 e M2 del brainstorming del 2026-10-14).

## Obiettivo del macrotask
Dopo il modulo 33 le azioni sugli utenti stanno ancora nelle righe della tabella e il root admin non vede né i workspace di un utente né quelli della piattaforma; nessuno può cambiare l'email di un utente finché l'invio delle email non è attivo. Dopo questo modulo:

- **Scheda dell'utente (M1)**: un clic sulla riga apre `/admin/users/[id]` con riepilogo, workspace (ruolo, numero di progetti, keyword del mese), azioni, registro e zona rossa; l'admin non root vede solo riepilogo, azioni che può fare ed Elimina.
- **Cambio email da root (M3)**: con il lancio in pausa la nuova email nasce verificata, con il lancio attivo parte la verifica; nel registro la riga senza indirizzi.
- **Elenco dei workspace (M2)**: nome, proprietario, membri, numero di progetti e piano; nessun dato dei progetti.

## Task atomici

```yaml
- id: T-3401
  title: "Scheda dell'utente"
  macrotask: "ux-admin-users"
  depends_on: [T-3303, T-1704, T-1703, T-2006]

  objective: >
    Dare a ogni utente una scheda con i suoi dati, i suoi workspace e le azioni, che escono dalle righe della tabella,
    con le regole di visibilità di oggi.

  definition_of_done:
    - "GET /api/admin/users/[id] (isAdminUser; 401 senza sessione, 403 per gli altri utenti): stesse regole di visibilità dell'elenco, quindi l'admin non root riceve 404 per un utente che non è sottoscrittore; risposta con id, nome mostrato, email, email verificata sì o no, ruolo, stato, root, created_at, last_login_at, versione e data dei termini accettati; per il solo root anche workspaces (nome, personale sì o no, ruolo, numero di progetti, keyword del mese dal contatore keywords_month di T-1703) e le ultime 20 righe del registro con bersaglio l'utente; header Cache-Control no-store; nessun nome o dato dei progetti."
    - "Pagina /admin/users/[id] nel gruppo delle sezioni (voce Utenti in aria-current): «← Utenti»; intestazione con nome, email (verificata o no), stato e ruolo; card Riepilogo; Workspace e Registro solo per il root; Azioni (cambio di ruolo, sospendi o riattiva, reimposta la password) con le rotte e le regole di oggi (T-507, T-1704); Elimina in una DangerZoneCard (T-2006)."
    - "Tabella degli utenti (T-3303): il nome di ogni riga porta alla scheda; le colonne sono utente, ruolo, stato e ultimo accesso; i controlli di ruolo, stato, password ed eliminazione escono dalle righe."
    - "Registro (AdminAuditLogCard, T-1704): nella colonna «Su chi» il bersaglio porta alla sua scheda quando è un utente che esiste ancora."

  acceptance_criteria:
    - id: AC-3401-1
      given: "il root admin e l'utente U, OWNER di W1 (2 progetti, uno chiamato 'Progetto-Segreto-XYZ', contatore keywords_month 1240) e MEMBER di W2"
      when: "il root invia GET /api/admin/users/{U}"
      then: "la risposta è 200 con header Cache-Control no-store e workspaces di 2 elementi, con projectCount 2 e keywordsThisMonth 1240 per W1; la stringa JSON non contiene 'Progetto-Segreto-XYZ' né password_hash"
    - id: AC-3401-2
      given: "un admin non root, un sottoscrittore S e un admin A"
      when: "l'admin non root chiede la scheda di S e poi di A"
      then: "la prima risposta è 200 senza le chiavi workspaces e audit; la seconda è 404"
    - id: AC-3401-3
      given: "un utente SUBSCRIBER autenticato"
      when: "invia GET /api/admin/users/{U}"
      then: "la risposta è 403"
    - id: AC-3401-4
      given: "il root admin autenticato e l'utente U"
      when: "apre /admin/users e clicca il nome di U"
      then: "l'indirizzo diventa /admin/users/{U}; la pagina mostra le card Riepilogo, Workspace e Registro e i pulsanti delle azioni; tornati su /admin/users le righe della tabella non contengono select del ruolo né pulsanti di reset della password"

  target_tests:
    - file: "tests/integration/admin-user-detail.test.ts"
      covers: [AC-3401-1, AC-3401-2, AC-3401-3]
    - file: "tests/e2e/admin-sections.spec.ts"
      covers: [AC-3401-4]

  security_notes:
    - "A01 / CWE-639 e CWE-285: l'id della scheda viene dall'indirizzo, ma la rotta applica lato server le regole di visibilità dell'elenco (l'admin non root vede solo i sottoscrittori) e restituisce workspace e registro solo al root."
    - "Privacy (T-1705, principio della pagina di amministrazione): della parte progetti esce solo il numero, mai nomi, keyword o contenuti."

  out_of_scope:
    - "Uso per persona: le estrazioni non registrano chi le avvia, l'uso si conta per workspace."

- id: T-3402
  title: "Cambio email da root admin"
  macrotask: "ux-admin-users"
  depends_on: [T-3401, T-3001, T-1606, T-1403]

  objective: >
    Permettere al root admin di correggere l'email di un utente, l'unico modo di cambiarla finché l'invio delle email
    non è attivo, con le stesse regole di verifica della creazione da admin.

  definition_of_done:
    - "PATCH /api/admin/users/[id] accetta email solo dal root admin (403 FORBIDDEN per gli altri), con le regole di oggi sul root e su sé stessi (FORBIDDEN, SELF_ACTION_FORBIDDEN); email normalizzata (400 EMAIL_INVALID); 409 EMAIL_TAKEN se è di un altro utente; con il lancio in pausa email_verified_at = adesso, con il lancio attivo null e parte la verifica di T-1403 verso il nuovo indirizzo; le richieste di cambio email in attesa dell'utente (T-3001) diventano usate; riga di registro user.email_change senza indirizzi (CWE-532); se isEmailDeliveryAvailable(), template email-changed al vecchio indirizzo."
    - "Scheda dell'utente: «Cambia email» (solo root) apre una finestra con la nuova email; dopo il salvataggio la scheda mostra la nuova email."

  acceptance_criteria:
    - id: AC-3402-1
      given: "il root admin, l'utente U con a@example.com, il lancio in pausa ed EMAIL_TRANSPORT outbox"
      when: "il root invia PATCH /api/admin/users/{U} con { email: 'b@example.com' }"
      then: "la risposta è 200; users.email vale b@example.com con email_verified_at non nullo; il registro ha 1 riga user.email_change in più la cui serializzazione non contiene 'a@example.com' né 'b@example.com'; l'outbox ha 1 email email-changed verso a@example.com"
    - id: AC-3402-2
      given: "un admin non root, il sottoscrittore S e l'utente V con c@example.com"
      when: "l'admin non root invia PATCH di S con { email: 'd@example.com' } e il root invia PATCH di S con { email: 'c@example.com' }"
      then: "le risposte sono 403 FORBIDDEN e 409 EMAIL_TAKEN e users.email di S è invariato"
    - id: AC-3402-3
      given: "il lancio attivo ed EMAIL_TRANSPORT outbox"
      when: "il root cambia l'email di U in e@example.com"
      then: "users.email vale e@example.com con email_verified_at nullo e l'outbox ha 1 email verify-email verso e@example.com"

  target_tests:
    - file: "tests/integration/admin-email-change.test.ts"
      covers: [AC-3402-1, AC-3402-2, AC-3402-3]

  security_notes:
    - "A01 / CWE-269: solo il root admin cambia un'email; mai la propria da qui (resta il percorso dell'utente, T-3001) e mai quella del root."
    - "A09 / CWE-532: l'azione è nel registro senza gli indirizzi; avviso al vecchio indirizzo quando l'invio è attivo."

  out_of_scope:
    - "Cambio email da parte dell'admin non root."

- id: T-3403
  title: "Elenco dei workspace della piattaforma"
  macrotask: "ux-admin-users"
  depends_on: [T-3301, T-1501, T-1604]

  objective: >
    Dare al root admin l'elenco dei workspace con i soli numeri che servono, senza dati dei progetti.

  definition_of_done:
    - "GET /api/admin/workspaces (solo root: 403 agli altri admin e agli utenti, 401 senza sessione): pagine da 50 con ricerca, senza distinzione di maiuscole, sul nome del workspace o sul nome mostrato e l'email del proprietario; per ciascuno id, nome, personale sì o no, proprietario (id e nome mostrato), numero di membri, numero di progetti, piano (planId dell'abbonamento o free); header Cache-Control no-store; nessun dato dei progetti."
    - "Pagina /admin/workspaces e voce «Workspace» nella navigazione del root (dopo Utenti); il proprietario porta alla sua scheda (T-3401)."

  acceptance_criteria:
    - id: AC-3403-1
      given: "il workspace W1 di 'Agenzia Rossi' con OWNER U, 3 membri e 7 progetti di cui uno 'Progetto-Segreto-XYZ', e il workspace personale W2 di un altro utente"
      when: "il root invia GET /api/admin/workspaces"
      then: "la risposta è 200 con header Cache-Control no-store; l'elemento di W1 ha membersCount 3, projectCount 7, owner.id U e plan 'free'; la stringa JSON non contiene 'Progetto-Segreto-XYZ'"
    - id: AC-3403-2
      given: "gli stessi workspace"
      when: "il root cerca 'ROSSI'"
      then: "la risposta contiene W1 e non W2"
    - id: AC-3403-3
      given: "un admin non root, un SUBSCRIBER e una richiesta senza sessione"
      when: "ciascuno chiama GET /api/admin/workspaces"
      then: "le risposte sono 403, 403 e 401"

  target_tests:
    - file: "tests/integration/admin-workspaces.test.ts"
      covers: [AC-3403-1, AC-3403-2, AC-3403-3]

  security_notes:
    - "A01 / CWE-285: solo root, verificato nella rotta; la ricerca usa parametri Prisma, mai SQL composto (CWE-89); dei progetti esce solo il conteggio."

  out_of_scope:
    - "Scheda del workspace e azioni sui workspace dall'amministrazione."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41): scheda dell'utente con le azioni fuori dalle righe, cambio email da root con la regola di verifica della creazione da admin, elenco dei workspace con i soli conteggi.
- Gate umani: nessuno.
- Scelte dell'agente da confermare (rilievi): ultime 20 righe del registro nella scheda; ricerca dei workspace anche sull'email del proprietario; l'admin non root riceve 404, non 403, per la scheda di un admin.
- Note di costruzione (2026-10-16), scelte dell'agente da confermare dall'utente. T-3401: `getAdminUserDetail` in `lib/admin/user-detail.ts` (null, quindi 404, per un utente che non esiste o è fuori dal perimetro dell'admin non root); i workspace vengono dalle membership con il conteggio dei progetti e il contatore keywords_month del mese UTC in corso; il registro è `listUserAuditLog` (ultime 20 righe) in `lib/admin/audit.ts`, che per ogni riga dà anche `targetUserName` quando il bersaglio è un utente che esiste ancora. Pagina `app/admin/(sections)/users/[id]/page.tsx`: «← Utenti», intestazione con nome, email («verificata» o «da verificare»), stato e ruolo; card Riepilogo (creato il, ultimo accesso, termini accettati con versione e data); Workspace (nome con «personale», ruolo, progetti, keyword del mese) e Registro (AdminAuditLogCard con titolo e testo propri, senza «Carica altre») solo per il root; Azioni (`components/admin-user-actions.tsx`: ruolo con «Salva il ruolo» solo per il root, «Sospendi» o «Riattiva», «Reimposta la password», «Cambia email» solo per il root) ed «Elimina l'utente» nella DangerZoneCard con la conferma del browser di oggi e il ritorno all'elenco. Azioni ed Elimina compaiono solo per gli utenti che l'admin può gestire (mai il root admin, mai sé stessi). Nella tabella degli utenti le colonne sono utente, ruolo, stato e ultimo accesso e il nome è un link alla scheda. La navigazione a sezioni segna la voce con l'indirizzo più lungo che contiene la pagina (`components/section-nav.tsx`), quindi la scheda è sotto Utenti. Nel Registro il bersaglio utente ancora esistente è un link con il suo nome mostrato.
- Note di costruzione (2026-10-16), T-3402: PATCH /api/admin/users/[id] con `email` è un'azione a sé (gli altri campi non si leggono); il 403 dell'admin non root viene prima di ogni altro controllo, poi le regole di oggi sul bersaglio; la stessa email di prima risponde 400 VALIDATION_ERROR. Nella stessa transazione, oltre alle richieste di cambio in attesa, smettono di valere i link di verifica e di recupero password ancora aperti del vecchio indirizzo (`closeOldAddressLinks` in `lib/account/email-change.ts`, comune con la conferma di T-3001): un vecchio link di verifica non deve verificare il nuovo indirizzo. La riga user.email_change ha metadata vuoti. Verifica e avviso partono dopo la risposta (`runAfterResponse`). Nella finestra un testo spiega la regola di verifica del lancio e l'avviso al vecchio indirizzo.
- Note di costruzione (2026-10-16), T-3403: pagina server `app/admin/(sections)/workspaces/page.tsx` con la ricerca nell'indirizzo (form GET con «Cerca», `?searchText=`) e PaginationLinks, 50 per pagina dal più recente; il proprietario è il primo OWNER per data di ingresso (link alla scheda); i membri contano tutte le membership, OWNER compreso; il piano è il plan_id dell'abbonamento in qualunque stato (anche cancellato o scaduto), free senza abbonamento. Emendamento dichiarato di AC-3301-1 nel modulo 33 (5 voci e /admin/workspaces).
