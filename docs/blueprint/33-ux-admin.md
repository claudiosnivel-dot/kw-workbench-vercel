# 33-ux-admin — Macrotask `ux-admin`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 6 di 7: Amministrazione diventa un'area a sezioni con la navigazione a sinistra del modulo 28, con i contenuti di oggi rimessi al posto giusto.

## Obiettivo del macrotask
Oggi `/admin` è una colonna di sette blocchi (indicatori, lancio, branding, Google Sheets, spesa DataForSEO, registro, gestione utenti); l'admin non root vede il branding in sola lettura e la gestione utenti. Dopo questo modulo:

- **Sezioni**: Panoramica (`/admin`), Utenti (`/admin/users`), Impostazioni (`/admin/settings`), Registro (`/admin/log`); Workspace (`/admin/workspaces`) arriva con il modulo 34. L'admin non root vede solo Utenti.
- **Panoramica** con gli indicatori in riquadri e la spesa DataForSEO con una barra.
- **Utenti** con i totali trasformati in filtri con il conteggio e «Crea utente» in una finestra.

## Task atomici

```yaml
- id: T-3301
  title: "Area Amministrazione a sezioni"
  macrotask: "ux-admin"
  depends_on: [T-2801, T-507, T-506, T-908, T-903, T-1606, T-1704, T-1705]

  objective: >
    Dividere la pagina di amministrazione in sezioni con la navigazione comune, root e admin non root ciascuno con le
    sole sezioni che gli spettano.

  definition_of_done:
    - "Layout delle sezioni (app/admin/(sections)/layout.tsx): requirePageUser e isAdminUser (gli altri utenti vanno alla home, come oggi); PageIntro «Amministrazione» e SectionNav con Panoramica (/admin), Utenti (/admin/users), Impostazioni (/admin/settings) e Registro (/admin/log) per il root admin; per l'admin non root la sola voce Utenti."
    - "Pagine: Panoramica con AdminKpiCard e MetricsSpendCard; Utenti con AdminUsersDashboard; Impostazioni con BrandingSettingsCard, GoogleSheetsApiConfigCard e AdminLaunchCard; Registro con AdminAuditLogCard. Panoramica, Impostazioni e Registro sono del solo root: l'admin non root che le apre va a /admin/users. La card del branding in sola lettura per l'admin non root sparisce."
    - "Emendamento dichiarato: AC-901-1 (modulo 09) — la pagina /admin/settings resa per il root admin non contiene il testo 'Google Keyword Planner'."

  acceptance_criteria:
    - id: AC-3301-1
      given: "un root admin autenticato"
      when: "apre /admin, /admin/users, /admin/settings e /admin/log"
      then: "ogni risposta è 200 con la navigazione di 4 voci e la voce corrente in aria-current 'page'; /admin/settings contiene «Lancio commerciale» e il campo del nome dell'applicazione; axe riporta 0 violazioni serious o critical su ciascuna"
    - id: AC-3301-2
      given: "un admin non root autenticato"
      when: "apre /admin, /admin/settings e /admin/log"
      then: "ogni volta arriva su /admin/users; la navigazione ha 1 sola voce «Utenti» e la pagina non contiene il campo del nome dell'applicazione"
    - id: AC-3301-3
      given: "un utente SUBSCRIBER autenticato"
      when: "apre /admin/users"
      then: "arriva alla home"

  target_tests:
    - file: "tests/e2e/admin-sections.spec.ts"
      covers: [AC-3301-1, AC-3301-2, AC-3301-3]

  security_notes:
    - "A01 / CWE-285: le pagine verificano lato server isAdminUser e, per Panoramica, Impostazioni e Registro, isRootAdmin; le rotte /api/admin restano protette come oggi (T-507, T-1704, T-1705, T-1606). La navigazione nasconde le voci solo per comodità."

  out_of_scope:
    - "Scheda dell'utente, cambio email da root ed elenco dei workspace (modulo 34)."

- id: T-3302
  title: "Panoramica a riquadri"
  macrotask: "ux-admin"
  depends_on: [T-3301, T-1705, T-903]

  objective: >
    Rendere leggibili a colpo d'occhio gli indicatori della piattaforma e la spesa del fornitore di metriche.

  definition_of_done:
    - "components/admin-kpi-card.tsx: i valori di PlatformKpi in riquadri (data-testid admin-kpi-tile) con il numero grande e l'etichetta: utenti (con i sospesi), workspace, estrazioni negli ultimi 30 giorni (somma di extractionsPerDay), job falliti negli ultimi 7 giorni in percentuale (o «nessun job concluso»), abbonamenti attivi, entrate mensili stimate (al posto di «MRR stimato»); nessun dato oltre la whitelist di T-1705."
    - "components/metrics-spend-card.tsx: speso e tetto del mese con una barra role progressbar (aria-valuenow uguale alla percentuale spesa, arrotondata), richieste e keyword sotto."

  acceptance_criteria:
    - id: AC-3302-1
      given: "AdminKpiCard con users { total 14, active 13, suspended 1 }, workspaces { total 9 }, extractionsPerDay con somma 37 e failedJobRate7d 0.02"
      when: "si rende"
      then: "ci sono 6 elementi data-testid admin-kpi-tile; i testi contengono 14, 9, 37 e '2%' e il componente non contiene il testo 'MRR'"
    - id: AC-3302-2
      given: "MetricsSpendCard con spentUsd 4.2 e budgetUsd 10"
      when: "si rende"
      then: "c'è 1 elemento role progressbar con aria-valuenow '42'"

  target_tests:
    - file: "tests/component/admin-overview.test.tsx"
      covers: [AC-3302-1, AC-3302-2]

  security_notes:
    - "Nessuna superficie nuova: gli stessi dati aggregati di T-1705 e T-903, solo per il root admin (AC-1705-3 resta)."

  out_of_scope:
    - "Grafici dell'andamento nel tempo."

- id: T-3303
  title: "Utenti: filtri con i conteggi e «Crea utente» in una finestra"
  macrotask: "ux-admin"
  depends_on: [T-3301, T-507]

  objective: >
    Trasformare i totali degli utenti in filtri con il conteggio e il modulo di creazione sempre aperto in una
    finestra, dividendo il componente della gestione utenti in parti più piccole.

  definition_of_done:
    - "components/admin-users-dashboard.tsx diviso in admin-users-dashboard.tsx (elenco e paginazione), admin-user-filters.tsx (ricerca con il debounce di oggi e filtri) e create-user-dialog.tsx (finestra)."
    - "Filtri a pulsante con il conteggio dai totali di T-507: Tutti, Attivi, Sospesi e, per il root, Admin; ciascuno imposta i filtri di stato o di ruolo della richiesta e ha aria-pressed; AC-507-4 (ricerca con debounce) resta valido."
    - "«Crea utente» apre una finestra (ModalDialog) con i campi e le regole di oggi (l'admin non root crea solo sottoscrittori); dopo la creazione la finestra si chiude e l'elenco si ricarica."

  acceptance_criteria:
    - id: AC-3303-1
      given: "AdminUsersDashboard del root con fetch simulato che restituisce totals { totalUsers 14, totalActive 13, totalSuspended 1, totalAdmins 2, totalSubscribers 12 }"
      when: "si clicca il filtro «Sospesi 1»"
      then: "la richiesta successiva ha il parametro status 'SUSPENDED' e quel pulsante ha aria-pressed 'true'"
    - id: AC-3303-2
      given: "lo stesso componente per un admin non root, con totalAdmins null"
      when: "si rende"
      then: "non c'è nessun filtro con il testo «Admin»"
    - id: AC-3303-3
      given: "il componente del root con fetch simulato che risponde 201 alla creazione"
      when: "si apre «Crea utente», si compilano i campi con l'email 'nuovo@example.com' e si conferma"
      then: "fetch riceve 1 POST /api/admin/users con l'email 'nuovo@example.com', l'elemento role dialog non c'è più e l'elenco è richiesto di nuovo"

  target_tests:
    - file: "tests/component/admin-users-filters.test.tsx"
      covers: [AC-3303-1, AC-3303-2, AC-3303-3]

  security_notes:
    - "A01 / CWE-285: i filtri cambiano solo la richiesta; GET /api/admin/users applica le regole di visibilità di oggi (l'admin non root vede solo i sottoscrittori, AC-507-1) e POST /api/admin/users quelle di creazione (T-507)."

  out_of_scope:
    - "Azioni dalla scheda dell'utente (T-3401)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41): cinque sezioni (la quinta, Workspace, nel modulo 34) e admin non root solo su Utenti.
- Gate umani: nessuno; nessuna pagina delle baseline visive.
- Scelte dell'agente da confermare (rilievi): il lancio commerciale sta in Impostazioni e non in Panoramica; l'admin non root perde la vista in sola lettura del branding; i riquadri sono 6 anche con il lancio in pausa (abbonamenti ed entrate a 0).
