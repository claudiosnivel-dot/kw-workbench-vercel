# 20-adjustments — Macrotask `adjustments`

> Rifiniture decise dall'utente il 2026-10-09 rispondendo alle domande sulle scelte rimaste aperte dei macrotask 15-18 (D-36). Si costruisce dopo il macrotask 19 (scelta dell'utente).

## Obiettivo del macrotask
Applicare otto cambiamenti di comportamento chiesti dall'utente su funzioni già in produzione: cancellazione dell'account più protetta e tracciata, annullamento gratuito di un'estrazione appena avviata, root admin sempre libero di usare il fornitore di volumi con licenza, progetto dell'onboarding fuori dal limite dei progetti, voce Fatturazione nella barra, eliminazione di un utente che non cancella il lavoro degli invitati, uscita dal workspace personale dopo il trasferimento e creazione di workspace di squadra dall'interfaccia. Ogni task emenda in modo dichiarato i criteri del task che modifica.

## Task atomici

```yaml
- id: T-2001
  title: "Cancellazione dell'account: tentativi limitati e traccia nel registro"
  macrotask: "adjustments"
  depends_on: [T-1804, T-1701, T-1704]

  objective: >
    Limitare i tentativi di password sulla cancellazione dell'account e lasciare nel registro admin una riga anonima
    che la cancellazione è avvenuta.

  definition_of_done:
    - "Regola di rate limit accountDelete per utente (chiave account-delete:user:<id>) con RATE_LIMIT_ACCOUNT_DELETE_MAX (default proposto 5) e RATE_LIMIT_ACCOUNT_DELETE_WINDOW_SECONDS (default 900) in INT_ENV, .env.example e docs/ENVIRONMENTS.md; oltre la soglia DELETE /api/account risponde 429 RATE_LIMITED con Retry-After prima di verificare la password."
    - "Dopo la cancellazione, nella stessa transazione, una riga account.delete in admin_audit_log con actor_user_id null, target_type user, target_id null, metadata vuoto e ip null; AdminAuditAction estesa."
    - "AC-1804-4 emendato: dopo la cancellazione il numero di righe di audit aumenta di 1 (la riga account.delete) e nessuna riga contiene id, nome o email dell'utente."

  acceptance_criteria:
    - id: AC-2001-1
      given: "RATE_LIMIT_ACCOUNT_DELETE_MAX uguale a 2 e un utente con sessione"
      when: "invia 3 DELETE /api/account con password sbagliata"
      then: "le prime 2 risposte sono 403 INVALID_PASSWORD e la terza è 429 RATE_LIMITED con Retry-After"
    - id: AC-2001-2
      given: "un utente cancellabile e N righe in admin_audit_log"
      when: "cancella l'account con la password giusta"
      then: "admin_audit_log ha N+1 righe; l'ultima ha action account.delete, actor_user_id null, target_id null e ip null; nessuna riga contiene id, nome o email dell'utente"

  target_tests:
    - file: "tests/integration/gdpr.test.ts"
      covers: [AC-2001-1, AC-2001-2]

  security_notes:
    - "A07 Authentication Failures / CWE-307 (Improper Restriction of Excessive Authentication Attempts): chi ha una sessione rubata non può provare password all'infinito sulla cancellazione."

- id: T-2002
  title: "Estrazione annullata entro 60 secondi senza consumo di quota"
  macrotask: "adjustments"
  depends_on: [T-1703, T-1204]

  objective: >
    Restituire la quota quando l'utente annulla un'estrazione entro 60 secondi dall'avvio, con il lancio commerciale
    attivo.

  definition_of_done:
    - "Annullamento con POST di cancel entro 60 secondi da created_at del job: la riserva della quota viene restituita come per un errore INTERNAL, senza contare nel tetto dei rimborsi automatici; oltre i 60 secondi l'annullamento consuma la quota come oggi (D-27 emendata il 2026-10-09)."
    - "Soglia in una costante documentata, non configurabile da env."

  acceptance_criteria:
    - id: AC-2002-1
      given: "lancio attivo, un workspace con 1 avvio usato su 3 al giorno e un job avviato da 10 secondi"
      when: "l'utente annulla il job"
      then: "il contatore degli avvii del giorno torna al valore precedente all'avvio e quello dei rimborsi del mese resta invariato"
    - id: AC-2002-2
      given: "lancio attivo e un job avviato da 61 secondi"
      when: "l'utente annulla il job"
      then: "il contatore degli avvii del giorno non cambia"

  target_tests:
    - file: "tests/integration/usage-quotas.test.ts"
      covers: [AC-2002-1, AC-2002-2]

- id: T-2003
  title: "Root admin sempre libero di usare il fornitore di volumi con licenza"
  macrotask: "adjustments"
  depends_on: [T-1605, T-902]

  objective: >
    Permettere al root admin di usare DataForSEO qualunque piano abbia il suo workspace, anche con il lancio
    commerciale attivo.

  definition_of_done:
    - "Con il lancio attivo, per un'estrazione avviata dal root admin licensedMetrics vale true e la quota licensedMetricsKeywordsPerMonth non si applica; per tutti gli altri utenti decide il piano come oggi (D-30 emendata il 2026-10-09)."

  acceptance_criteria:
    - id: AC-2003-1
      given: "lancio attivo, il workspace del root admin sul piano free senza licensedMetrics e un MEMBER di un altro workspace free"
      when: "entrambi avviano un'estrazione con il provider DATAFORSEO"
      then: "l'estrazione del root admin parte con DATAFORSEO; quella del MEMBER riceve 403 PLAN_LIMIT come oggi"

  target_tests:
    - file: "tests/integration/entitlements-enforcement.test.ts"
      covers: [AC-2003-1]

- id: T-2004
  title: "Progetto dell'onboarding fuori dal limite dei progetti"
  macrotask: "adjustments"
  depends_on: [T-1605, T-1001]

  objective: >
    Non contare nel limite maxProjects del piano il progetto creato dall'onboarding, così il primo progetto guidato
    non toglie spazio all'utente.

  definition_of_done:
    - "Colonna projects.created_via_onboarding (boolean, default false) con migrazione additiva, impostata a true dalla creazione dell'onboarding (T-1001); il conteggio di maxProjects esclude i progetti con created_via_onboarding true."

  acceptance_criteria:
    - id: AC-2004-1
      given: "lancio attivo, un piano con maxProjects 1 e un workspace con il progetto creato dall'onboarding"
      when: "l'utente crea un progetto da POST /api/projects"
      then: "la risposta è 201; un secondo POST /api/projects risponde 403 PLAN_LIMIT"

  target_tests:
    - file: "tests/integration/entitlements-enforcement.test.ts"
      covers: [AC-2004-1]

- id: T-2005
  title: "Voce Fatturazione nella barra per chi gestisce la fatturazione"
  macrotask: "adjustments"
  depends_on: [T-1604, T-1504]

  objective: >
    Rendere la pagina di fatturazione raggiungibile dalla barra in alto per chi ha il permesso billing.manage.

  definition_of_done:
    - "components/top-nav.tsx: voce Fatturazione verso /billing per gli utenti con billing.manage nel workspace attivo (app layout passa il permesso), nel menu desktop e mobile; testi nei cataloghi it ed en."
    - "La baseline visiva della dashboard di T-103 cambia (l'utente E2E è OWNER del proprio workspace): rigenerazione con gate umano prima del merge (modulo 04)."

  acceptance_criteria:
    - id: AC-2005-1
      given: "un OWNER e un MEMBER dello stesso workspace attivo"
      when: "si rende la barra per ciascuno"
      then: "la barra dell'OWNER contiene un link con href '/billing'; quella del MEMBER no"

  target_tests:
    - file: "tests/component/top-nav-support-link.test.tsx"
      covers: [AC-2005-1]

- id: T-2006
  title: "Eliminazione di un utente con trasferimento del workspace personale"
  macrotask: "adjustments"
  depends_on: [T-1503, T-1704]

  objective: >
    Quando il root admin elimina un utente, conservare il suo workspace personale con i progetti se ci lavorano altri
    membri, passandone la proprietà invece di cancellarlo.

  definition_of_done:
    - "deleteUserFromAdmin: se il workspace personale dell'utente ha altri membri, prima dell'eliminazione la proprietà passa al membro con il ruolo più alto (ADMIN, poi MEMBER; a parità la membership più vecchia), il workspace si stacca dall'utente (personal_for_user_id null) e resta con i progetti; senza altri membri si elimina come oggi. Riga user.delete del registro con metadata del trasferimento (id del workspace e del nuovo OWNER, mai email)."

  acceptance_criteria:
    - id: AC-2006-1
      given: "un utente U con il workspace personale W che contiene il progetto P, un ADMIN A e un MEMBER M di W"
      when: "il root admin elimina U"
      then: "W esiste con personal_for_user_id null e P; A è OWNER di W; M resta MEMBER"
    - id: AC-2006-2
      given: "un utente V con il workspace personale senza altri membri"
      when: "il root admin elimina V"
      then: "il workspace personale di V e i suoi progetti non esistono più"

  target_tests:
    - file: "tests/integration/admin-users.test.ts"
      covers: [AC-2006-1, AC-2006-2]

- id: T-2007
  title: "Uscita dal workspace personale dopo il trasferimento della proprietà"
  macrotask: "adjustments"
  depends_on: [T-1503]

  objective: >
    Permettere al creatore di un workspace personale di uscirne quando un altro membro ne è OWNER; il workspace
    diventa di squadra e l'utente riceve un nuovo workspace personale vuoto.

  definition_of_done:
    - "POST /api/workspaces/[workspaceId]/leave sul workspace personale: ammesso se esiste un altro OWNER; il workspace si stacca (personal_for_user_id null) e nella stessa transazione si crea un nuovo workspace personale vuoto con membership OWNER per l'utente (D-08 emendata: ogni utente ha sempre uno e un solo workspace personale); senza un altro OWNER resta 409 LAST_OWNER."
    - "Pagina Workspace: il pulsante Esci compare anche sul workspace personale quando c'è un altro OWNER."

  acceptance_criteria:
    - id: AC-2007-1
      given: "l'utente U creatore del workspace personale W con un altro OWNER O"
      when: "U invia POST /api/workspaces/W/leave"
      then: "la risposta è 200; U non è membro di W; W ha personal_for_user_id null e O come OWNER; U ha un nuovo workspace personale con membership OWNER e 0 progetti"
    - id: AC-2007-2
      given: "l'utente U unico OWNER del proprio workspace personale con un MEMBER"
      when: "U invia POST /api/workspaces/W/leave"
      then: "la risposta è 409 LAST_OWNER e le membership non cambiano"

  target_tests:
    - file: "tests/integration/workspace-invites.test.ts"
      covers: [AC-2007-1, AC-2007-2]

- id: T-2008
  title: "Creazione di un workspace di squadra dall'interfaccia"
  macrotask: "adjustments"
  depends_on: [T-1504]

  objective: >
    Permettere a ogni utente di creare un nuovo workspace di squadra di cui è OWNER, oltre al workspace personale.

  definition_of_done:
    - "POST /api/workspaces con { name } (da 1 a 80 caratteri): crea il workspace con slug univoco e la membership OWNER del creatore, lo rende attivo con il cookie kwb_workspace e risponde 201; con il lancio attivo il numero di workspace creati per utente segue un limite tecnico di 10 (409 WORKSPACE_LIMIT)."
    - "Pagina Workspace: modulo Crea workspace; dopo la creazione il selettore della barra compare (l'utente ha almeno 2 workspace)."

  acceptance_criteria:
    - id: AC-2008-1
      given: "un utente con il solo workspace personale"
      when: "invia POST /api/workspaces con name 'Agenzia'"
      then: "la risposta è 201; esiste il workspace 'Agenzia' con l'utente OWNER; il cookie kwb_workspace della risposta contiene il suo id; GET /api/workspaces elenca 2 workspace"
    - id: AC-2008-2
      given: "un utente"
      when: "invia POST /api/workspaces con name vuoto e poi con 81 caratteri"
      then: "entrambe le risposte sono 400 VALIDATION_ERROR e non nasce alcun workspace"

  target_tests:
    - file: "tests/integration/workspace-settings.test.ts"
      covers: [AC-2008-1, AC-2008-2]
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Decisioni dell'utente del 2026-10-09 (D-36), una per task; emendano D-27 (T-2002), D-30 (T-2003), D-08 (T-2007) e AC-1804-4 (T-2001).
- Scelte dell'agente da confermare: soglia di 5 tentativi in 15 minuti per la cancellazione; nuovo workspace personale vuoto per chi esce dal proprio; limite tecnico di 10 workspace creati per utente; il membro più vecchio a parità di ruolo nel trasferimento.
- T-2005 cambia la baseline visiva della dashboard: gate umano prima del merge.
