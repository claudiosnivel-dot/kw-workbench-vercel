# 22-rebrand — Macrotask `rebrand`

> Cambio del nome del prodotto deciso dall'utente il 2026-10-11 (D-38). Si costruisce dopo il macrotask 21.

## Obiettivo del macrotask
Il prodotto si chiama Titan SEO in tutta l'app, nei test e nei documenti: nome predefinito, testi, metadati, nomi dei file di export e identificativi tecnici. Il nome precedente non resta in nessun file tracciato, tranne i nomi reali esterni del progetto Vercel. L'immagine Open Graph usa il logo del sito.

## Task atomici

```yaml
- id: T-2201
  title: "Nome del prodotto Titan SEO in app, test e documenti"
  macrotask: "rebrand"
  depends_on: [T-2102, T-2103]

  objective: >
    Sostituire il nome precedente con Titan SEO ovunque nel repository, identificativi tecnici compresi, e impedire
    che torni con un test sul repository.

  definition_of_done:
    - "Nome predefinito Titan SEO in lib/integrations/branding.ts, nella barra (components/top-nav.tsx) e nella card del branding; segnaposto del nome e descrizioni delle pagine pubbliche nei cataloghi it ed en; APP_BRAND_NAME in .env.example e nella configurazione degli E2E."
    - "Identificativi tecnici: nomi dei file di export con prefisso titan-seo- (risultati) e titan-seo-strategy- (strategia), titolo predefinito del file Google Sheets «Titan SEO Export», User-Agent titan-seo/1.0 delle richieste all'autocomplete, nome del pacchetto titan-seo in package.json e package-lock.json."
    - "Documenti: README, docs/ e blueprint, storico di SESSION-STATE compreso; restano i nomi reali esterni del progetto Vercel (nome del progetto e URL dei deploy nella forma unita)."
    - "tests/tooling/brand-name.test.ts: git grep del nome precedente con spazio, trattino o trattino basso, senza distinzione di maiuscole, non trova righe nei file tracciati."
    - "Emendato AC-107-1 (prefisso del nome del file). Baseline visive di dashboard, risultati e login: la barra mostra il nome, quindi l'E2E gira nel container Linux di Playwright con --update-snapshots=changed; se il confronto resta entro la tolleranza nessuna baseline cambia e non serve il gate umano del modulo 04, altrimenti le nuove baseline si approvano prima del merge."

  acceptance_criteria:
    - id: AC-2201-1
      given: "il repository con tutti i file tracciati"
      when: "il test di tooling cerca il nome precedente con spazio, trattino o trattino basso, senza distinzione di maiuscole"
      then: "git grep esce con 1 e nessuna riga"
    - id: AC-2201-2
      given: "un progetto con candidate e una strategia"
      when: "si scaricano l'export CSV dei risultati e quello della strategia"
      then: "i nomi dei file iniziano rispettivamente con titan-seo- e con titan-seo-strategy-"
    - id: AC-2201-3
      given: "un nome dell'app salvato non valido (con caratteri di controllo) e nessun APP_BRAND_NAME"
      when: "si legge lo snapshot del branding"
      then: "appName è 'Titan SEO'"

  target_tests:
    - file: "tests/tooling/brand-name.test.ts"
      covers: [AC-2201-1]
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-2201-2]
    - file: "tests/integration/strategy-export.test.ts"
      covers: [AC-2201-2]
    - file: "tests/integration/branding.test.ts"
      covers: [AC-2201-3]

  security_notes:
    - "Nessuna superficie nuova: solo testi, nomi di file e un User-Agent; il nome resta reso come testo da React (CWE-79)."

  out_of_scope:
    - "Nome del progetto su Vercel e URL dei deploy, nome del repository su GitHub, progetto Supabase: risorse esterne, rinominabili solo dall'utente."
    - "Nome dell'app salvato nel database di produzione dalle impostazioni del branding: lo cambia il root admin da Personalizza."

- id: T-2202
  title: "Immagine Open Graph con il logo del sito"
  macrotask: "rebrand"
  depends_on: [T-1801]

  objective: >
    Sostituire l'immagine di anteprima per i social, che mostra il nome precedente, con una che usa il logo del sito.

  definition_of_done:
    - "public/og/site.png 1200x630 con il logo del sito (quello del branding di produzione, che contiene la scritta Titan SEO) e il sottotitolo di oggi; approvata dall'utente prima del merge (gate umano)."

  acceptance_criteria:
    - id: AC-2202-1
      given: "il file public/og/site.png"
      when: "si legge l'intestazione PNG"
      then: "la firma è quella di un PNG e le dimensioni sono 1200x630"

  target_tests:
    - file: "tests/unit/og-image.test.ts"
      covers: [AC-2202-1]

  security_notes:
    - "Nessuna superficie nuova: file statico servito senza sessione come oggi (T-1801)."

  out_of_scope:
    - "Testi della landing, da rivedere insieme all'utente in una sessione a parte."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Decisioni dell'utente del 2026-10-11 (D-38): grafia «Titan SEO»; identificativi tecnici rinominati; documenti e blueprint rinominati anche nello storico; immagine Open Graph con il logo del sito.
- Gate umani: nuova immagine Open Graph da approvare prima del merge; baseline visive solo se l'E2E le riscrive.
