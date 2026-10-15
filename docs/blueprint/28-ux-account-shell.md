# 28-ux-account-shell — Macrotask `ux-account-shell`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 1 di 7. Il menu dell'utente porta a due aree, «Il tuo account» e «Workspace», più Amministrazione per gli admin. Ogni area ha le sezioni elencate in una navigazione a sinistra (variante «A» del brainstorming del 2026-10-14). Questo modulo crea la navigazione comune e l'area dell'account con i contenuti di oggi rimessi al posto giusto.

## Obiettivo del macrotask
Oggi Personalizza mescola preferenze visive, Google Sheets, nome, password, «Esci da tutti i dispositivi» e due card che rimandano a Workspace e ad Account; Account contiene solo l'export e la cancellazione. Dopo questo modulo:

- **Navigazione a sezioni comune**: un solo componente, usato qui e poi da Workspace (modulo 31) e Amministrazione (modulo 33).
- **Il tuo account** in cinque sezioni: Profilo (`/account`), Accesso (`/account/security`), Preferenze (`/account/preferences`), Collegamenti (`/account/connections`), I tuoi dati (`/account/data`).
- **Nome senza password**: il nome mostrato si salva da solo; la password resta nella sezione Accesso, con la password attuale.
- **Menu**: la voce «Il tuo account» prende il posto di Personalizza e Account.
- **Vecchi indirizzi**: `/personalizza` porta a `/account/preferences`; il ritorno da Google arriva su Collegamenti.

## Task atomici

```yaml
- id: T-2801
  title: "Navigazione a sezioni e area Il tuo account"
  macrotask: "ux-account-shell"
  depends_on: [T-2304, T-1804, T-906, T-1104]

  objective: >
    Creare il componente di navigazione a sezioni comune alle tre aree del menu dell'utente e l'area /account con le
    sezioni Preferenze, Collegamenti e I tuoi dati, che ospitano le card di oggi senza cambiarne il comportamento.

  definition_of_done:
    - "components/section-nav.tsx (client): riceve un'etichetta accessibile e le voci { href, label }; rende un elemento nav con aria-label e l'elenco dei link; la voce con href uguale al pathname corrente (usePathname) ha aria-current=\"page\" e lo stile della voce attiva (stile «A», D-39); da 768 px di larghezza sta a sinistra del contenuto, sotto va sopra il contenuto come riga scorrevole; nessuna stringa fuori dai cataloghi."
    - "Layout delle sezioni dell'account in un gruppo di route (app/account/(sections)/layout.tsx): requirePageUser, PageIntro «Il tuo account» e SectionNav con Profilo (/account), Accesso (/account/security), Preferenze (/account/preferences), Collegamenti (/account/connections), I tuoi dati (/account/data). /account/password (T-1704) resta fuori dal gruppo e non mostra la navigazione."
    - "Pagine /account/preferences con PersonalizationSettingsCard, /account/connections con GoogleSheetsPersonalCard, /account/data con AccountDataCard, con gli stessi dati iniziali di oggi; /account diventa la sezione Profilo con T-2802."
    - "lib/integrations/google-sheets-oauth.ts: il ritorno da Google porta a /account/connections con gli stessi parametri google_sheets e reason. Emendamento dichiarato: AC-906-1 (modulo 09) attende Location '/account/connections?google_sheets=error&reason=config_oauth_mancante'."
    - "Catalogo account.sections in it ed en (titolo dell'area, etichetta della navigazione, nomi delle cinque sezioni); i file nuovi entrano in I18N_MIGRATED_FILES di tests/unit/no-hardcoded-strings.test.ts."

  acceptance_criteria:
    - id: AC-2801-1
      given: "SectionNav montato con le cinque voci dell'account e il pathname simulato /account/preferences"
      when: "si rende il componente"
      then: "l'elemento nav ha l'aria-label del catalogo, contiene 5 link ed esattamente 1 ha aria-current 'page': quello con testo «Preferenze» e href /account/preferences"
    - id: AC-2801-2
      given: "un utente autenticato dedicato al test, non quello delle baseline visive"
      when: "apre /account/preferences, /account/connections e /account/data"
      then: "ogni risposta è 200; ogni pagina ha il titolo «Il tuo account», la navigazione con la voce corrente in aria-current 'page' e la card di oggi (titoli «Accessibilità e tema», «Google Sheets personale», «Scarica i tuoi dati»); axe riporta 0 violazioni serious o critical su ciascuna"
    - id: AC-2801-3
      given: "un utente con must_change_password true (T-1704)"
      when: "apre /account/password"
      then: "la risposta è 200 e la pagina non contiene l'elemento nav delle sezioni dell'account"

  target_tests:
    - file: "tests/component/section-nav.test.tsx"
      covers: [AC-2801-1]
    - file: "tests/e2e/account-sections.spec.ts"
      covers: [AC-2801-2, AC-2801-3]

  security_notes:
    - "Nessuna superficie nuova: le pagine passano da requirePageUser come oggi e le card usano le rotte esistenti. Il ritorno da Google resta un percorso relativo fisso, mai preso dalla richiesta (CWE-601)."
    - "La pagina del cambio password obbligato resta l'unica aperta finché il flag è attivo (T-1704): il layout delle sezioni non la avvolge."

  out_of_scope:
    - "Profilo e Accesso (T-2802), preferenze salvate da sole (T-2901), Google Sheets in parole semplici (T-2902), cambio email (modulo 30)."

- id: T-2802
  title: "Profilo e Accesso: nome senza password, password a parte"
  macrotask: "ux-account-shell"
  depends_on: [T-2801, T-1401, T-1704, T-501]

  objective: >
    Separare nome e password, oggi nello stesso modulo che chiede sempre la password attuale: il nome si cambia nella
    sezione Profilo senza password, la password nella sezione Accesso con la password attuale, e Personalizza sparisce.

  definition_of_done:
    - "Sezione Profilo (/account): campo «Nome mostrato» con «Salva» che invia PATCH /api/auth/config con il solo displayName; l'email del profilo mostrata come testo (il cambio arriva con il modulo 30)."
    - "Sezione Accesso (/account/security): modulo Password (password attuale, nuova, ripeti) e «Esci da tutti i dispositivi» (POST /api/auth/logout-all, che chiude l'accesso anche su questo dispositivo, come oggi); /account/password (T-1704) usa lo stesso modulo Password."
    - "PATCH /api/auth/config: con il solo displayName la password attuale non è richiesta; con newPassword restano CURRENT_PASSWORD_REQUIRED, CURRENT_PASSWORD_INVALID e PASSWORD_MISMATCH di oggi; durante il cambio password obbligato una richiesta senza newPassword risponde 403 con code PASSWORD_CHANGE_REQUIRED."
    - "next.config.ts redirects(): /personalizza verso /account/preferences (permanent false), accanto a /onboarding."
    - "Rimozioni approvate con il blueprint (D-41): app/personalizza/page.tsx, components/settings-link-card.tsx e components/auth-settings-card.tsx (sostituita dai moduli Nome e Password); le chiavi dei cataloghi rimaste senza uso tolte in it ed en; i file rimossi escono da I18N_MIGRATED_FILES; knip senza segnalazioni."

  acceptance_criteria:
    - id: AC-2802-1
      given: "un utente autenticato con password P"
      when: "invia PATCH /api/auth/config con { displayName: 'Nuovo nome' } senza currentPassword"
      then: "la risposta è 200 con data.displayName 'Nuovo nome', users.display_name vale 'Nuovo nome' e session_version è invariato"
    - id: AC-2802-2
      given: "lo stesso utente"
      when: "invia PATCH con newPassword e confirmPassword senza currentPassword, poi con currentPassword errata"
      then: "le risposte sono 400 CURRENT_PASSWORD_REQUIRED e 401 CURRENT_PASSWORD_INVALID e password_hash è invariato"
    - id: AC-2802-3
      given: "un utente con must_change_password true"
      when: "invia PATCH /api/auth/config con il solo displayName"
      then: "la risposta è 403 con code PASSWORD_CHANGE_REQUIRED e users.display_name è invariato"
    - id: AC-2802-4
      given: "un utente autenticato dedicato al test"
      when: "apre /personalizza, /account e /account/security"
      then: "/personalizza porta a /account/preferences; /account mostra il campo «Nome mostrato», l'email come testo e 0 campi di tipo password; /account/security mostra 3 campi password e il pulsante «Esci da tutti i dispositivi»"

  target_tests:
    - file: "tests/integration/account-profile.test.ts"
      covers: [AC-2802-1, AC-2802-2, AC-2802-3]
    - file: "tests/e2e/account-sections.spec.ts"
      covers: [AC-2802-4]

  security_notes:
    - "A07 / CWE-620: il cambio password chiede la password attuale come oggi e incrementa session_version (T-501). Il nome mostrato non è un dato di accesso: senza password resta dietro la sessione e il blocco del cambio password obbligato (T-1704)."
    - "A04 / CWE-200: nessun dato nuovo esposto; la rotta resta l'unica di dati ammessa durante il cambio password obbligato, solo per la password."

  out_of_scope:
    - "Cambio dell'email (modulo 30); dispositivi collegati e verifica in due passaggi (lavoro futuro, D-41)."

- id: T-2803
  title: "Menu dell'utente: «Il tuo account»"
  macrotask: "ux-account-shell"
  depends_on: [T-2802, T-2304]

  objective: >
    Portare il menu dell'utente alla nuova area: una sola voce «Il tuo account» al posto di Personalizza e Account.

  definition_of_done:
    - "components/user-menu.tsx: la voce «Il tuo account» (href /account) sostituisce Personalizza e Account; le altre voci restano (Workspace, Fatturazione per chi la gestisce fino a T-3103, Amministrazione, Supporto, lingua, Esci); chiavi nav.personalize e nav.account sostituite da nav.yourAccount in it ed en."
    - "Emendamento dichiarato: AC-2304-1 (modulo 23) — il menu di MEMBER, OWNER e root admin contiene «Il tuo account» con href /account e nessuna voce verso /personalizza; tests/e2e/a11y.spec.ts (AC-1104-3) apre /account/preferences."

  acceptance_criteria:
    - id: AC-2803-1
      given: "il menu dell'utente di un MEMBER aperto"
      when: "si leggono le voci role menuitem"
      then: "c'è 1 voce «Il tuo account» con href /account, 0 voci con href /personalizza e 0 voci con testo «Personalizza»"

  target_tests:
    - file: "tests/component/user-menu.test.tsx"
      covers: [AC-2803-1]

  security_notes:
    - "Nessuna superficie nuova: cambia solo un link del menu; le pagine restano protette lato server."

  out_of_scope:
    - "Voce Fatturazione e «Nuovo workspace…» (T-3103)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41): aree «Il tuo account» e «Workspace», navigazione a sinistra (variante A), sezioni approvate con i mockup.
- Gate umani: nessuno; il modulo non tocca le pagine fotografate dalle baseline visive (dashboard e risultati).
- Rimozioni approvate con il blueprint (D-41): `app/personalizza/page.tsx`, `components/settings-link-card.tsx`, `components/auth-settings-card.tsx`.
- Scelte dell'agente da confermare (rilievi): segmenti degli indirizzi in inglese come le pagine del progetto; nome salvato senza password; durante il cambio password obbligato il nome non si cambia (403).
