# 31-ux-workspace — Macrotask `ux-workspace`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 4 di 7: l'area «Workspace» con tre sezioni e la navigazione a sinistra del modulo 28; la fatturazione entra nel workspace e il menu dell'utente crea i workspace nuovi.

## Obiettivo del macrotask
Oggi `/workspace` è una pila di card (ruolo e nota su Google Sheets, nome, membri, inviti, invito, trasferimento, uscita, creazione) e `/billing` è una pagina a parte con la sua voce nel menu. Dopo questo modulo:

- **Workspace** in tre sezioni sotto un'intestazione con nome, ruolo e tipo: Generale (`/workspace`: nome e «Azioni irreversibili»), Membri (`/workspace/members`: membri e inviti), Piano (`/workspace/plan`: la fatturazione di oggi).
- **Vecchio indirizzo**: `/billing` porta a `/workspace/plan`, anche dai banner del pagamento scaduto e del limite del piano.
- **Menu**: «+ Nuovo workspace…» sotto l'elenco dei workspace apre una finestra con il solo nome; la voce Fatturazione esce dal menu.

## Task atomici

```yaml
- id: T-3101
  title: "Area Workspace: Generale e Membri"
  macrotask: "ux-workspace"
  depends_on: [T-2801, T-1504, T-1503, T-2007]

  objective: >
    Dividere la pagina del workspace nelle sezioni Generale e Membri, con l'intestazione comune e la navigazione a
    sezioni, mantenendo controlli e regole di oggi.

  definition_of_done:
    - "Layout delle sezioni del workspace (app/workspace/(sections)/layout.tsx): requirePageUser e getPageWorkspace; titolo con il nome del workspace attivo, riga con il ruolo e il tipo (personale o di squadra), SectionNav con Generale (/workspace), Membri (/workspace/members) e Piano (/workspace/plan)."
    - "Generale: WorkspaceNameForm e una DangerZoneCard «Azioni irreversibili» con TransferOwnershipForm (chi ha workspace.transfer, con altri membri) e LeaveWorkspaceButton (regole di T-2007); spariscono la card con ruolo, nota su Google Sheets e link a /billing; CreateWorkspaceForm lascia la pagina (va nel menu con T-3103)."
    - "Membri: tabella dei membri con l'email sotto il nome, ruolo modificabile e «Rimuovi» per chi ha members.manage secondo le regole di oggi (T-1503); inviti in attesa con «Revoca» e InviteForm per chi ha members.manage."
    - "Emendamento dichiarato: AC-1504-3 (modulo 15) — il MEMBER vede l'elenco dei membri con i ruoli e 0 pulsanti «Rimuovi» in /workspace/members e il campo nome con disabled in /workspace; il resto del criterio è invariato."

  acceptance_criteria:
    - id: AC-3101-1
      given: "un MEMBER e un ADMIN dello stesso workspace di squadra W"
      when: "entrambi aprono /workspace e /workspace/members"
      then: "tutte le risposte sono 200 con la navigazione delle sezioni e la voce corrente in aria-current 'page'; il MEMBER vede il campo nome con disabled, l'elenco dei membri con i ruoli e 0 pulsanti «Rimuovi» o «Invia invito»; l'ADMIN vede il modulo d'invito; nessuna delle pagine contiene un link con href /billing"
    - id: AC-3101-2
      given: "l'OWNER di W con un altro membro e l'OWNER di un workspace personale senza altri membri"
      when: "ciascuno apre /workspace"
      then: "il primo vede nella zona «Azioni irreversibili» il modulo «Trasferisci la proprietà» e il pulsante «Abbandona»; il secondo non vede né l'uno né l'altro"

  target_tests:
    - file: "tests/e2e/workspace-sections.spec.ts"
      covers: [AC-3101-1, AC-3101-2]

  security_notes:
    - "A01 / CWE-285: i controlli si rendono solo ai ruoli ammessi dalla tabella dei permessi (T-1502) e ogni azione resta verificata dalle rotte di T-1503; la pagina mostra solo il workspace attivo dell'utente (getPageWorkspace)."

  out_of_scope:
    - "Link d'invito da copiare e inviti scaduti (modulo 32)."

- id: T-3102
  title: "Sezione Piano e vecchio indirizzo /billing"
  macrotask: "ux-workspace"
  depends_on: [T-3101, T-1604, T-1606, T-1703]

  objective: >
    Spostare la fatturazione del workspace nella sezione Piano, con le card in ordine e la frase del lancio in pausa,
    e far arrivare lì i vecchi link.

  definition_of_done:
    - "app/workspace/(sections)/plan/page.tsx con la logica di app/billing/page.tsx: con il lancio in pausa (D-32) la frase «In questa fase il workspace non ha limiti e non si acquista nessun piano»; con il lancio attivo le card «Il tuo piano» (piano, stato, rinnovo o disdetta programmata, data-testid billing-summary), «Uso del mese» (UsageSummary) e «Gestisci» solo per billing.manage, con data-testid billing-action sulle azioni come oggi."
    - "next.config.ts: /billing verso /workspace/plan (permanent false); components/past-due-banner.tsx e components/plan-limit-notice.tsx puntano a /workspace/plan; rimozione approvata con il blueprint (D-41) di app/billing/page.tsx, che esce da I18N_MIGRATED_FILES."
    - "Emendamenti dichiarati: AC-1604-3 e AC-1604-4 (modulo 16) aprono /workspace/plan al posto di /billing; tests/integration/billing-portal.test.ts rende la pagina della sezione Piano."

  acceptance_criteria:
    - id: AC-3102-1
      given: "il lancio in pausa e un MEMBER autenticato"
      when: "apre /billing"
      then: "arriva su /workspace/plan con status 200, la voce «Piano» in aria-current 'page' e la frase del lancio in pausa visibile"
    - id: AC-3102-2
      given: "il lancio attivo, l'OWNER e un MEMBER di W con abbonamento active e Paddle simulato"
      when: "ciascuno rende la sezione Piano"
      then: "entrambi vedono data-testid billing-summary con il nome del piano; il MEMBER ha 0 elementi data-testid billing-action e l'OWNER almeno 1"
    - id: AC-3102-3
      given: "PastDueBanner e PlanLimitNotice resi con le props di un workspace con pagamento scaduto e con un limite raggiunto"
      when: "si leggono i link"
      then: "entrambi hanno 1 link con href /workspace/plan e 0 link con href /billing"

  target_tests:
    - file: "tests/e2e/workspace-sections.spec.ts"
      covers: [AC-3102-1]
    - file: "tests/integration/workspace-plan.test.ts"
      covers: [AC-3102-2]
    - file: "tests/component/billing-links.test.tsx"
      covers: [AC-3102-3]

  security_notes:
    - "A01 / CWE-285: come oggi tutti i membri vedono piano e uso, solo chi ha billing.manage vede le azioni, riverificate dalle rotte di T-1604 (portale, cambio piano, disdetta)."

  out_of_scope:
    - "Prezzi, piani e checkout: restano legati a D-14 e al lancio commerciale (D-32)."

- id: T-3103
  title: "Menu: «Nuovo workspace…» e fine della voce Fatturazione"
  macrotask: "ux-workspace"
  depends_on: [T-3101, T-2008, T-2005, T-2803]

  objective: >
    Creare un workspace dal menu dell'utente con una piccola finestra e togliere dal menu la voce Fatturazione, ora
    sezione del workspace.

  definition_of_done:
    - "components/user-menu.tsx: sotto il gruppo dei workspace la voce «+ Nuovo workspace…» apre una finestra (ModalDialog) con il solo nome e «Crea», che invia POST /api/workspaces (T-2008) e poi chiama router.refresh: il nuovo workspace è quello attivo; con un solo workspace il gruppo mostra solo «+ Nuovo workspace…»; errori in un elemento role alert con la finestra aperta."
    - "La voce Fatturazione esce dal menu; app/layout.tsx non calcola più showBillingLink; CreateWorkspaceForm esce da components/workspace-controls.tsx se resta senza uso (rimozione approvata con il blueprint, D-41)."
    - "Emendamenti dichiarati: AC-2304-1 (modulo 23) senza la voce Fatturazione; AC-2005-1 (modulo 20) superato: nessun menu contiene href /billing."

  acceptance_criteria:
    - id: AC-3103-1
      given: "il menu di un OWNER con un solo workspace e fetch simulato che risponde 201 a POST /api/workspaces"
      when: "sceglie «Nuovo workspace…», scrive 'Clienti 2027' e conferma"
      then: "fetch è chiamato 1 volta con POST /api/workspaces e corpo { name: 'Clienti 2027' }, l'elemento role dialog non c'è più e router.refresh è chiamato 1 volta"
    - id: AC-3103-2
      given: "la stessa finestra con fetch simulato che risponde 400 con code VALIDATION_ERROR"
      when: "si conferma un nome vuoto"
      then: "un elemento role alert contiene il messaggio d'errore e l'elemento role dialog resta"
    - id: AC-3103-3
      given: "il menu dell'utente di un OWNER che gestisce la fatturazione"
      when: "si leggono le voci role menuitem"
      then: "0 voci hanno href /billing o testo «Fatturazione» e 1 voce «Workspace» ha href /workspace"

  target_tests:
    - file: "tests/component/user-menu.test.tsx"
      covers: [AC-3103-1, AC-3103-2, AC-3103-3]

  security_notes:
    - "Nessuna superficie nuova: la creazione usa POST /api/workspaces con la validazione e il limite di T-2008."

  out_of_scope:
    - "Elenco di tutti i workspace della piattaforma (T-3403)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41): tre sezioni (inviti dentro Membri, trasferimento e uscita in fondo a Generale), fatturazione nel workspace, «Nuovo workspace…» nel menu.
- Gate umani: nessuno; nessuna pagina delle baseline visive.
- Rimozioni approvate con il blueprint (D-41): `app/billing/page.tsx` e, se resta senza uso, `CreateWorkspaceForm`.
- Scelte dell'agente da confermare (rilievi): la sezione Piano la vedono tutti i membri in sola lettura (come la pagina di oggi); il gruppo dei workspace nel menu compare anche con un solo workspace, per «Nuovo workspace…».
