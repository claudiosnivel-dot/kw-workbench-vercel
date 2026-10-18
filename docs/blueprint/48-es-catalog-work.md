# 48-es-catalog-work — Macrotask `es-catalog-work`

> Spagnolo (D-47), modulo 2 di 5: strategia, export, impostazioni e integrazioni, poi accesso, account e fatturazione nelle due varianti, con la guida di stile e il glossario del modulo 47.

## Obiettivo del macrotask
Dopo il modulo 47 il percorso di lavoro è in spagnolo. Dopo questo modulo lo sono anche:

- **Strategia ed export**: testi della strategia e del suo PDF, modelli di H1 e H2 (scritti come titoli spagnoli, non tradotti), intestazioni e valori dei file Excel e Google Sheets, finestra Esporta.
- **Impostazioni e integrazioni**: impostazioni del progetto, Google Sheets, Keyword Planner.
- **Accesso, account e fatturazione**: login, registrazione, recupero password, «Mi cuenta» e le sue sezioni, piani e fatturazione, footer.

## Task atomici

```yaml
- id: T-4801
  title: "Strategia, export, impostazioni e integrazioni in spagnolo"
  macrotask: "es-catalog-work"
  depends_on: [T-4702, T-2102, T-2103]

  objective: >
    Dare in spagnolo la strategia, i file che l'utente scarica e le impostazioni del progetto, con la terminologia SEO
    che si usa in ciascun mercato.

  definition_of_done:
    - "messages/es-ES.json con i namespace strategy, export, exportDialog, settings e integrations; messages/es-419.json con le sole differenze. I modelli di H1 e H2 (strategy.templates) sono scritti come titoli spagnoli con la maiuscola solo sulla prima parola e forme valide in Spagna e in America Latina; il codice che li usa per lo spagnolo arriva con T-5101."
    - "Export dei risultati e della strategia (T-2102, T-2103) con un utente in es-ES o es-419: intestazioni ed etichette dai cataloghi spagnoli, come oggi per italiano e inglese."
    - "Parità di T-4702 estesa ai nuovi namespace; registro delle scelte in docs/I18N-ES.md."

  acceptance_criteria:
    - id: AC-4801-1
      given: "un progetto con 3 keyword tenute e un utente con lingua es-ES"
      when: "scarica l'export dei risultati in Excel"
      then: "la prima intestazione è «Palabra clave» e la colonna delle ricerche al mese ha l'intestazione del catalogo es-ES con «volumen de búsqueda»"
    - id: AC-4801-2
      given: "i cataloghi it, es-ES ed es-419"
      when: "si esegue il controllo di parità sui namespace di questo modulo"
      then: "nessuna chiave mancante, nessun valore vuoto, argomenti ICU uguali a quelli italiani e nessuna occorrenza vietata"

  target_tests:
    - file: "tests/integration/export-es.test.ts"
      covers: [AC-4801-1]
    - file: "tests/unit/i18n-catalog-parity.test.ts"
      covers: [AC-4801-2]

  security_notes:
    - "A03 / CWE-1236: le celle dei file restano neutralizzate come oggi (T-804), qualunque sia la lingua delle etichette."

  out_of_scope:
    - "Titoli fissi della strategia generati in spagnolo (T-5101): qui solo i testi dei cataloghi."

- id: T-4802
  title: "Accesso, account e fatturazione in spagnolo"
  macrotask: "es-catalog-work"
  depends_on: [T-4801]

  objective: >
    Completare in spagnolo le pagine che un utente vede entrando e gestendo il proprio account.

  definition_of_done:
    - "messages/es-ES.json con i namespace auth, account, billing e footer; messages/es-419.json con le sole differenze (per esempio la sezione «Ajustes»/«Configuración» e i costi)."
    - "Parità di T-4702 estesa ai nuovi namespace; registro delle scelte in docs/I18N-ES.md."

  acceptance_criteria:
    - id: AC-4802-1
      given: "i cataloghi es-ES ed es-419"
      when: "si legge auth.login.submit e auth.login.forgotPassword"
      then: "auth.login.submit vale «Iniciar sesión» e auth.login.forgotPassword vale «¿Olvidaste tu contraseña?» in entrambe"
    - id: AC-4802-2
      given: "i cataloghi it, es-ES ed es-419"
      when: "si esegue il controllo di parità sui namespace di questo modulo"
      then: "nessuna chiave mancante, nessun valore vuoto, argomenti ICU uguali a quelli italiani e nessuna occorrenza vietata"

  target_tests:
    - file: "tests/unit/i18n-es-strings.test.ts"
      covers: [AC-4802-1]
    - file: "tests/unit/i18n-catalog-parity.test.ts"
      covers: [AC-4802-2]

  security_notes:
    - "A07: i messaggi di accesso e recupero password restano generici anche in spagnolo (nessuna enumerazione degli account, T-1404)."

  out_of_scope:
    - "Workspace, amministrazione, email e sito pubblico (modulo 49)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-47): localizzazione semantica con la guida e il glossario del modulo 47.
- Gate umani: nessuno.
