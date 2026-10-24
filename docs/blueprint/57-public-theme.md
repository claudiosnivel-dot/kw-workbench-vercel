# 57-public-theme — Macrotask `public-theme`

> Pagina principale con il percorso guidato (D-53), 1 di 3: le pagine pubbliche nel tema del dispositivo, chiaro o scuro, con un interruttore sole/luna. Viene prima della nuova pagina principale (58), che nasce già nei due temi.

## Obiettivo del macrotask
Oggi chi non ha fatto l'accesso vede sempre il tema scuro (`themeMode` di default `DARK` in `app/layout.tsx`); il tema chiaro lo vede solo chi lo sceglie nelle preferenze dell'account (T-2901). Dopo questo modulo:

- **Tema del dispositivo**: chi non ha fatto l'accesso vede le pagine pubbliche (principale, prezzi, contatti, pagine legali, accesso e registrazione) nel tema del suo telefono o computer, senza lampi al caricamento.
- **Interruttore sole/luna**: nella barra in alto degli anonimi un pulsante passa all'altro tema e il browser lo ricorda con un cookie tecnico. Chi ha fatto l'accesso continua a usare il tema delle preferenze dell'account.

## Task atomici

```yaml
- id: T-5701
  title: "Tema del dispositivo per chi non ha fatto l'accesso"
  macrotask: "public-theme"
  depends_on: [T-2901, T-1801, T-4902]

  objective: >
    Mostrare le pagine a chi non ha fatto l'accesso nel tema del suo dispositivo, chiaro o scuro, senza lampi al caricamento.

  definition_of_done:
    - "lib/ui/theme.ts (puro): resolveThemeMode({ userTheme, cookieTheme }) restituisce il tema delle preferenze dell'utente quando c'è una sessione, altrimenti il valore del cookie kwb_theme se è DARK o LIGHT, altrimenti SYSTEM; app/layout.tsx lo scrive in data-theme dell'elemento html."
    - "app/globals.css: i token del tema chiaro, scritti una volta sola nel sorgente, valgono con data-theme LIGHT e, con data-theme SYSTEM, quando il dispositivo preferisce il chiaro (prefers-color-scheme: light); con SYSTEM e un dispositivo scuro o senza preferenza restano i token scuri. Il tema lo decide il CSS, senza script prima del rendering, quindi nessun lampo al caricamento."
    - "components/top-nav.tsx: con SYSTEM il logo del marchio è quello del tema effettivo del dispositivo (matchMedia), anche quando il dispositivo cambia tema a pagina aperta."
    - "playwright.config.ts: colorScheme dark per tutti i test, così le baseline visive di login, dashboard e risultati (T-103) restano quelle approvate; i test del tema chiaro lo chiedono esplicitamente."

  acceptance_criteria:
    - id: AC-5701-1
      given: "un visitatore senza sessione né cookie kwb_theme con il dispositivo impostato sul tema chiaro"
      when: "apre /it e /login"
      then: "in entrambe le pagine l'elemento html ha data-theme SYSTEM e la variabile --bg-0 calcolata sull'elemento html vale #eef3f7"
    - id: AC-5701-2
      given: "un visitatore senza sessione né cookie kwb_theme con il dispositivo impostato sul tema scuro"
      when: "apre /it"
      then: "l'elemento html ha data-theme SYSTEM e la variabile --bg-0 calcolata sull'elemento html vale #030712"
    - id: AC-5701-3
      given: "un utente con una sessione e il tema DARK nelle preferenze, con il dispositivo sul tema chiaro e il cookie kwb_theme LIGHT nel browser"
      when: "apre /it"
      then: "l'elemento html ha data-theme DARK"
    - id: AC-5701-4
      given: "nessun utente e il cookie kwb_theme con valore «PURPLE»"
      when: "resolveThemeMode risolve il tema"
      then: "il risultato è SYSTEM"

  target_tests:
    - file: "tests/e2e/public-theme.spec.ts"
      covers: [AC-5701-1, AC-5701-2, AC-5701-3]
    - file: "tests/unit/theme-mode.test.ts"
      covers: [AC-5701-4]

  security_notes:
    - "A03 / CWE-20: il valore del cookie entra nell'HTML solo se è DARK o LIGHT; ogni altro valore diventa SYSTEM."

  out_of_scope:
    - "Una scelta «come il dispositivo» nelle preferenze dell'account; il tema scelto da anonimo copiato nell'account alla registrazione; il tema delle email."

- id: T-5702
  title: "Interruttore sole/luna nelle pagine pubbliche"
  macrotask: "public-theme"
  depends_on: [T-5701, T-1803, T-2304]

  objective: >
    Lasciare a chi non ha fatto l'accesso la scelta tra tema chiaro e scuro, ricordata dal browser.

  definition_of_done:
    - "components/top-nav.tsx: nella barra degli anonimi (pagine pubbliche, accesso e registrazione, anche nel menu da telefono) un pulsante con l'icona del sole o della luna e l'etichetta accessibile «Passa al tema chiaro» o «Passa al tema scuro» secondo il tema effettivo; il clic passa subito all'altro tema (data-theme LIGHT o DARK, senza ricaricare la pagina) e scrive il cookie kwb_theme (path /, un anno, SameSite Lax, Secure su https). Con una sessione il pulsante non c'è: il tema resta quello delle preferenze dell'account (T-2901)."
    - "Etichette nel namespace nav dei cataloghi it, en ed es-ES; es-419 le eredita da es-ES salvo differenze (T-4701)."
    - "lib/legal/cookie-inventory.ts: kwb_theme, tecnico, «Tema chiaro o scuro scelto con l'interruttore delle pagine pubbliche; scritto dal browser», durata un anno. La cookie policy di D-15 resta un segnaposto: l'inventario ne è la base (T-1803)."

  acceptance_criteria:
    - id: AC-5702-1
      given: "un visitatore senza sessione né cookie kwb_theme su /it con il dispositivo sul tema scuro"
      when: "clicca «Passa al tema chiaro» e poi ricarica la pagina"
      then: "dopo il clic l'elemento html ha data-theme LIGHT e il browser ha il cookie kwb_theme con valore LIGHT; dopo il ricaricamento l'HTML arrivato dal server ha data-theme LIGHT"
    - id: AC-5702-2
      given: "la barra in alto resa per un utente con una sessione e poi per un anonimo su /it"
      when: "si cercano i pulsanti del tema"
      then: "per l'utente con la sessione non c'è nessun pulsante «Passa al tema chiaro» né «Passa al tema scuro»; per l'anonimo con data-theme DARK c'è il pulsante «Passa al tema chiaro»"
    - id: AC-5702-3
      given: "il codice dell'app che scrive il cookie kwb_theme"
      when: "si esegue la scansione dei nomi di cookie di app, lib e components"
      then: "kwb_theme è nell'inventario con categoria technical"

  target_tests:
    - file: "tests/e2e/public-theme.spec.ts"
      covers: [AC-5702-1]
    - file: "tests/component/top-nav-theme.test.tsx"
      covers: [AC-5702-2]
    - file: "tests/tooling/cookie-inventory.test.ts"
      covers: [AC-5702-3]

  security_notes:
    - "A05 / CWE-1004: il cookie non è HttpOnly perché lo scrive il browser; contiene solo DARK o LIGHT, nessun dato personale, e il server accetta solo questi due valori (T-5701)."

  out_of_scope:
    - "Tornare a «come il dispositivo» dopo una scelta (basta cancellare il cookie dal browser); un interruttore nell'app per chi ha fatto l'accesso."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-24 con l'utente (D-53): «vorrei farla anche per il tema chiaro», poi «segue il dispositivo e interruttore nella pagina».
- Gate umani: gli screenshot delle pagine pubbliche (/it, /it/pricing, /login, /register) nel tema chiaro e nello scuro, da computer (1280 px) e da telefono (390 px), approvati dall'utente prima del merge; le baseline visive di T-103 restano scure (colorScheme dark nei test) e non si rigenerano.
- Ordine: dipende da 18, 23, 29 e 49, già chiusi; viene prima del 58 e del 59.
