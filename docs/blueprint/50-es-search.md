# 50-es-search — Macrotask `es-search`

> Spagnolo (D-47), modulo 4 di 5: le ricerche in spagnolo trovano e classificano le keyword come quelle in italiano e in inglese: composizioni spagnole scelte sui suggerimenti reali di Google in Spagna e in Messico, classificazione dell'intento in spagnolo e file di Keyword Planner esportati in spagnolo.

## Obiettivo del macrotask
Google Autocomplete funziona già con `es` e con tutti i paesi, e DataForSEO copre la Spagna e l'America Latina. Mancano le regole di lingua. Dopo questo modulo:

- **Composizioni spagnole**: 8, scelte contando i suggerimenti di Google su parole di prova in es/ES ed es/MX e tenendo quelle che rendono in entrambi i mercati.
- **Classificazione**: domande, intento commerciale e transazionale, ricerche locali e strumenti riconosciuti anche in spagnolo.
- **Keyword Planner in spagnolo**: il parser legge i file esportati da Google Ads con l'interfaccia in spagnolo.

## Task atomici

```yaml
- id: T-5001
  title: "Composizioni e classificazione in spagnolo"
  macrotask: "es-search"
  depends_on: [T-4902, T-3702, T-704]

  objective: >
    Far trovare alle ricerche in spagnolo le stesse varianti utili delle altre lingue e riconoscere l'intento delle
    keyword spagnole.

  definition_of_done:
    - "prisma/seed.ts: DEFAULT_PATTERNS.es con 8 composizioni scelte alla costruzione contando i suggerimenti di Google (stesso metodo del set italiano, 2026-10-18) su quattro parole di prova in es/ES ed es/MX fra almeno 16 candidate (per esempio '{seed} precio', '{seed} cerca de mí', 'mejores {seed}', '{seed} opiniones', '{seed} para', '{seed} online', '{seed} barato', 'cómo elegir {seed}'); conteggi e scelta in docs/I18N-ES.md."
    - "lib/modules/classification.ts: lessico 'es' con domande (cómo, qué, cuál, cuánto, cuántos, dónde, cuándo, por qué, quién), commerciale (precio, barato, mejor, mejores, comparativa, opiniones, reseñas, vs), transazionale (comprar, alquiler, alquilar, contratar, oferta, descuento), locale (cerca de mí, cerca de mi) e strumenti (calculadora, generador, plantilla); per parola intera come T-704, anche senza accenti."
    - "Emendamenti dichiarati alla costruzione: AC-3702-1 (modulo 37) usa come lingua senza composizioni il francese ('fr' con la seed 'chaussures') al posto dello spagnolo; AC-3702-2 e AC-204-1 (modulo 02) e AC-403-4 (modulo 04) contano 24 righe globali, 8 per lingua."

  acceptance_criteria:
    - id: AC-5001-1
      given: "le composizioni globali del seed e un argomento in spagnolo con la seed 'cama de hospital' e un autocomplete simulato"
      when: "si esegue la ricerca"
      then: "le query contengono le 8 composizioni spagnole applicate alla seed e nessuna composizione italiana o inglese"
    - id: AC-5001-2
      given: "expansion_patterns vuota"
      when: "si esegue seedGlobalDefaults due volte di seguito"
      then: "dopo ciascuna esecuzione le righe globali sono 24, 8 per ciascuna di en, it ed es"
    - id: AC-5001-3
      given: "le keyword 'cómo elegir cama de hospital', 'cama de hospital precio', 'alquiler cama de hospital', 'cama de hospital cerca de mi' e 'calculadora de dosis'"
      when: "si classificano con language_code es"
      then: "la prima è una domanda, la seconda commerciale, la terza transazionale, la quarta locale, la quinta di tipo strumento"

  target_tests:
    - file: "tests/integration/expansion-language.test.ts"
      covers: [AC-5001-1]
    - file: "tests/integration/seed.test.ts"
      covers: [AC-5001-2]
    - file: "tests/unit/classification-es.test.ts"
      covers: [AC-5001-3]

  security_notes:
    - "A08 / CWE-362: il seed resta transazionale e senza cancellazioni (T-204)."

  out_of_scope:
    - "Composizioni diverse per paese dentro la stessa lingua."

- id: T-5002
  title: "File di Keyword Planner esportati in spagnolo"
  macrotask: "es-search"
  depends_on: [T-5001, T-905, T-910]

  objective: >
    Accettare i volumi scaricati da Keyword Planner anche da chi usa Google Ads in spagnolo.

  definition_of_done:
    - "Parser del CSV di Keyword Planner (T-905): intestazioni spagnole delle colonne già lette in italiano e in inglese (per esempio «Palabra clave», «Promedio de búsquedas mensuales», «Competencia», «Puja por la parte superior de la página (intervalo bajo)» e «(intervalo alto)»), prese dalla documentazione di Google Ads in spagnolo; numeri con la virgola decimale e il punto delle migliaia; intervalli di volume spagnoli («1000 - 10.000», «10 mil - 100 mil») come gli altri."
    - "Fixture tests/fixtures/planner/keyword-planner-es.csv costruita da quelle intestazioni; se l'utente fornisce un file reale scaricato in spagnolo, sostituisce la fixture (come il primo file reale in inglese, 2026-10-06)."

  acceptance_criteria:
    - id: AC-5002-1
      given: "la fixture in spagnolo con 3 righe, una con il volume '10 mil - 100 mil' e una con la puja '1,25'"
      when: "si esegue il parser"
      then: "ci sono 3 keyword; la seconda ha il punto medio dell'intervallo come per l'italiano; la puja vale 1,25 in micros (1250000)"

  target_tests:
    - file: "tests/unit/planner-csv-es.test.ts"
      covers: [AC-5002-1]

  security_notes:
    - "A03 / CWE-1236: le celle importate restano trattate come dati, con gli stessi limiti di dimensione del parser (T-905)."

  out_of_scope:
    - "File di Keyword Planner in lingue diverse da italiano, inglese e spagnolo."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-47): contenuti in spagnolo con la variante dal paese del progetto; composizioni scelte sui suggerimenti reali dei due mercati.
- Gate umani: nessuno. Un file reale di Keyword Planner in spagnolo dall'utente confermerebbe le intestazioni (facoltativo).
- Scelte dell'agente (approvate con il modulo): un solo set di composizioni per lo spagnolo; francese come lingua senza composizioni nei criteri del modulo 37.
- Note di costruzione (2026-10-19), scelte dell'agente da confermare dall'utente. T-5001: parole di prova «cama de hospital», «cafetera», «abogado» e «curso de inglés», 22 candidate provate in es/ES ed es/MX con i parametri della ricerca; scelte le 8 con più suggerimenti **nuovi** rispetto alla ricerca di base della stessa parola (parola, lettere e cifre) invece del totale usato per l'italiano: con il totale sarebbero entrate «{seed} para» ed «{seed} en», che ripetono in buona parte la ricerca di base, al posto di «{seed} opiniones» e «{seed} cerca de mí»; di due forme della stessa parola resta quella con più suggerimenti («precio», «mejor»). Set: 'qué es {seed}', '{seed} precio', 'comprar {seed}', '{seed} con', 'mejor {seed}', 'tipos de {seed}', '{seed} opiniones', '{seed} cerca de mí'; conteggi in docs/I18N-ES.md (con le composizioni ES e MX danno gli stessi numeri, con liste diverse). Lessico: per le parole con l'accento anche la forma senza («cómo»/«como», «reseñas»/«resenas»); le domande riconoscono anche due parole all'inizio («por qué»), con lo stesso risultato di prima per le domande di una parola; navigazionale, prodotto, servizio e contenuti come l'italiano. T-5002: colonna della concorrenza accettata come «Competencia» e come «Competitividad» (nome della guida di Google Ads in spagnolo), con e senza «(valor indexado)»; livello «Baja» = 0,2 come «Bassa»; «mil» vale mille anche fuori dagli intervalli; fixture costruita dalle intestazioni (un file reale scaricato in spagnolo la sostituirebbe).
- Emendamenti dichiarati (2026-10-19, costruzione): AC-3702-1 e AC-3702-2 (modulo 37), AC-204-1 (modulo 02) e AC-403-4 (modulo 04), come dal DoD di T-5001.
