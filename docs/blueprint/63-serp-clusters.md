# 63-serp-clusters — Macrotask `serp-clusters`

> Piano per intento di ricerca (D-57), 3 di 3: il raggruppamento nuovo. Una pagina per ogni intento (keyword con gli stessi risultati di Google), hub con la pilastro più ampia, una sola pagina locale per hub al posto delle città sparse, le keyword dei concorrenti fuori dal piano con il motivo.

## Obiettivo del macrotask
Dopo il modulo 62 il lavoro di piano ha volumi e risultati di Google, ma raggruppa ancora per parole di partenza (D-33): un progetto con una sola seed ha un solo hub e le keyword sparse confluiscono nella pilastro (122 su 125 nel progetto «Noleggio magnetoterapia» il 2026-11-12). Dopo questo modulo:

- **Pagine per intento**: keyword con almeno 3 dei primi 10 risultati in comune con la keyword di testa stanno nella stessa pagina.
- **Hub per argomento**: la pilastro è la pagina con la keyword più ampia; le pagine sullo stesso argomento sono i suoi spoke, anche partendo da una sola seed.
- **Luoghi**: le keyword con una città, una provincia, una regione o «vicino a me» formano una sola pagina locale per hub.
- **Concorrenti**: le keyword che cercano un altro sito o un'altra attività vanno tra le non assegnate con il motivo «concorrente».
- **Riserva**: senza risultati di Google il raggruppamento resta quello di oggi; senza AI valgono solo i riconoscimenti fissi.

## Task atomici

```yaml
- id: T-6301
  title: "Luoghi e concorrenti riconosciuti con l'AI"
  macrotask: "serp-clusters"
  depends_on: [T-6101, T-3802, T-3901, T-5102]

  objective: >
    Sapere quali keyword nominano un luogo e quali cercano un concorrente, in qualunque lingua, senza chiedere
    all'utente che tipo di sito ha.

  definition_of_done:
    - "lib/modules/plan-ai/classify.ts: classifyKeywords(keywords, serps, context) restituisce per ogni forma canonica una classe fra place, competitor e other. Prima i riconoscimenti fissi: le keyword con categoria di modificatore local (sequenze come «vicino a me», modifiers.ts) sono place; una keyword che contiene, senza spazi e senza punti, il nome del dominio del primo risultato organico (senza www e senza dominio di primo livello) è competitor. Le altre vanno al modello a lotti di 300 con requestWithFallback e i modelli della card (T-3802), una riga di ai_requests per tentativo con feature 'plan' (T-3901)."
    - "Prompt in italiano, in spagnolo e in inglese per le altre lingue come i titoli (T-5102), con le keyword come dati e non istruzioni; risposta validata: un oggetto JSON con le sole forme canoniche inviate e una classe ammessa ciascuna; forme mancanti, in più o classi sconosciute valgono other. Un lotto senza risposta valida lascia le sue keyword con i riconoscimenti fissi e l'esito ha il motivo AI_CLASSIFY_UNAVAILABLE; nessun errore blocca il piano."
    - "Con la funzione AI spenta o senza chiave nessuna richiesta e motivo AI_NOT_CONFIGURED."

  acceptance_criteria:
    - id: AC-6301-1
      given: "le keyword 'noleggio magnetoterapia lodi', 'noleggio magnetoterapia vicino a me', 'noleggiomagnetoterapia it recensioni' con primo risultato https://www.noleggiomagnetoterapia.it/, 'noleggio magnetoterapia costo', e OpenRouter simulato che classifica 'noleggio magnetoterapia lodi' place e 'noleggio magnetoterapia costo' other"
      when: "si chiama classifyKeywords in italiano"
      then: "le classi sono place, place, competitor e other; il modello riceve solo 'noleggio magnetoterapia lodi' e 'noleggio magnetoterapia costo'"
    - id: AC-6301-2
      given: "OpenRouter simulato che risponde con testo non JSON a ogni modello"
      when: "si chiama classifyKeywords sulle stesse keyword"
      then: "'noleggio magnetoterapia vicino a me' è place, 'noleggiomagnetoterapia it recensioni' è competitor, le altre due sono other e l'esito ha il motivo AI_CLASSIFY_UNAVAILABLE"
    - id: AC-6301-3
      given: "301 keyword da classificare con il modello"
      when: "si chiama classifyKeywords"
      then: "OpenRouter riceve 2 richieste, la prima con 300 keyword e la seconda con 1"

  target_tests:
    - file: "tests/unit/plan-classify.test.ts"
      covers: [AC-6301-1, AC-6301-2, AC-6301-3]

  security_notes:
    - "A03 / CWE-1427 (prompt injection): le keyword sono dati nel messaggio dell'utente in JSON; la risposta è validata con un insieme chiuso di classi e di forme canoniche."
    - "A09 / CWE-532: nei log solo conteggi, modello ed esito; mai keyword o messaggi del fornitore."

  out_of_scope:
    - "Riconoscere marche, usi o altri temi con l'AI: i temi nascono dai risultati di Google."

- id: T-6302
  title: "Motore del piano per risultati di Google"
  macrotask: "serp-clusters"
  depends_on: [T-6301, T-1901, T-2502]

  objective: >
    Mettere sulla stessa pagina le keyword con lo stesso intento di ricerca e formare gli hub per argomento, senza
    dipendere dalle parole di partenza.

  definition_of_done:
    - "lib/modules/strategy/serp-cluster.ts: buildSerpPlan({ keywords, serps, classes, language, rules, anchors }) puro e deterministico (stesso piano per qualunque ordine in ingresso), restituisce lo StrategyPlan di oggi. Keyword ordinate con compareKeywordPriority; le competitor vanno tra le non assegnate."
    - "Pagine: la prima keyword non assegnata con risultati apre una pagina e prende le keyword non assegnate con risultati che hanno almeno serpPageOverlap URL in comune con lei (regola nuova, default 3, limiti 1-10); le keyword place non entrano nelle pagine per intento. Keyword principale e priorità come oggi."
    - "Hub: le pagine in ordine di priorità; una pagina diventa spoke della prima pilastro di cui contiene tutte le parole di contenuto della keyword principale (keywordWords senza modificatori) o con cui ha almeno serpHubOverlap URL in comune fra le keyword principali (regola nuova, default 1, limiti 1-10); altrimenti apre un hub e ne è la pilastro, scelta fra le pagine del suo gruppo come quella con meno parole di contenuto e, a parità, priorità più alta. Regole di oggi: una pagina sotto minKeywordsPerSpoke e minSpokeVolume confluisce nella pagina dello stesso hub con più URL in comune, altrimenti nella pilastro; oltre maxSpokesPerHub gli spoke a priorità più bassa confluiscono; domande sotto questionSpokeVolume nelle FAQ della pagina con più URL in comune."
    - "Pagina locale: le keyword place di un hub (quello della pagina con più URL in comune, altrimenti l'hub a priorità più alta) formano un solo spoke con contentType local, soggetto alle stesse soglie."
    - "Keyword senza risultati (oltre le prime 1000 o non arrivati): vanno nella pagina con più parole di contenuto in comune con la keyword principale, almeno una; altrimenti tra le non assegnate. Ancore della rigenerazione come oggi (T-2502): le pagine iniziate restano e le keyword nuove vanno nei loro hub se ne seguono la regola."
    - "Motivi nuovi in STRATEGY_REASON_CODES con i testi in strategy.reasons (it, en, es-ES, es-419): HUB_SERP (pilastro), SPOKE_SERP (pagina per intento, con il numero di keyword), SPOKE_LOCAL (pagina locale, con il numero di luoghi), COMPETITOR (keyword di un concorrente tra le non assegnate)."

  acceptance_criteria:
    - id: AC-6302-1
      given: "il perimetro della fixture tests/fixtures/strategy/it-magnetoterapia-serp.json (keyword, volumi, risultati e classi di un progetto con una sola seed: costi e prezzi con gli stessi risultati, detrazione e 730 con gli stessi risultati, 20 città place, 2 concorrenti) con le regole predefinite"
      when: "si chiama buildSerpPlan"
      then: "il piano ha 1 hub con pilastro 'noleggio magnetoterapia'; 'noleggio magnetoterapia costo', 'noleggio magnetoterapia prezzi' e 'noleggio magnetoterapia quanto costa' sono nella stessa pagina; 'noleggio magnetoterapia 730' e 'noleggio magnetoterapia detraibile' sono nella stessa pagina, diversa da quella dei costi; le 20 città sono tutte nell'unica pagina con contentType local; i 2 concorrenti sono tra le non assegnate con motivo COMPETITOR; nessuna pagina ha una sola città come keyword principale"
    - id: AC-6302-2
      given: "la stessa fixture con le keyword in ordine inverso"
      when: "si chiama buildSerpPlan"
      then: "il piano è identico a quello di AC-6302-1"
    - id: AC-6302-3
      given: "due gruppi di keyword senza URL in comune fra loro e senza parole di contenuto in comune ('scarpe running', 'scarpe running offerte' e 'zaino trekking', 'zaino trekking 40 litri', con risultati diversi)"
      when: "si chiama buildSerpPlan con le regole predefinite"
      then: "il piano ha 2 hub con pilastro 'scarpe running' e 'zaino trekking'"
    - id: AC-6302-4
      given: "la fixture di AC-6302-1 con serpPageOverlap 10"
      when: "si chiama buildSerpPlan"
      then: "'noleggio magnetoterapia costo' e 'noleggio magnetoterapia prezzi' non sono più nella stessa pagina"

  target_tests:
    - file: "tests/unit/strategy-serp-cluster.test.ts"
      covers: [AC-6302-1, AC-6302-2, AC-6302-3, AC-6302-4]

  security_notes:
    - "Funzione pura senza I/O; priorità limitate al massimo della colonna Int come oggi (CWE-190)."

  out_of_scope:
    - "Pagine per città create in automatico."
    - "Raggruppare per titoli o testi dei risultati."

- id: T-6303
  title: "Il lavoro di piano usa il raggruppamento per risultati di Google"
  macrotask: "serp-clusters"
  depends_on: [T-6302, T-6202]

  objective: >
    Mettere il motore nuovo nel lavoro di piano, con le sue regole nella modalità esperta, lasciando il motore di oggi
    come riserva.

  definition_of_done:
    - "Fase classify del lavoro di piano (dopo serps_collect, T-6201) con classifyKeywords (T-6301); fase cluster: con risultati per almeno metà delle prime 1000 keyword del perimetro buildSerpPlan e grouping_source SERP, altrimenti buildStrategyPlan, grouping_source ENGINE e grouping_notice con il motivo (anche SERP_TOO_FEW); i motivi dell'AI (AI_CLASSIFY_UNAVAILABLE, AI_NOT_CONFIGURED) finiscono in grouping_notice anche con grouping_source SERP. Avvisi della pagina del piano (T-6202) con i testi dei motivi nuovi."
    - "lib/modules/strategy/rules.ts: serpPageOverlap (default 3, limiti 1-10) e serpHubOverlap (default 1, limiti 1-10) in DEFAULT_RULES, RULE_LIMITS e nello schema della modalità esperta; components/strategy/strategy-settings.tsx con i due campi e il testo d'aiuto, nei cataloghi it, en, es-ES ed es-419."
    - "Il motore di oggi (cluster.ts) resta invariato e coperto dai suoi test."

  acceptance_criteria:
    - id: AC-6303-1
      given: "un progetto del root admin con il perimetro della fixture it-magnetoterapia-serp.json, DataForSEO e OpenRouter simulati con i dati della fixture"
      when: "invia POST /api/projects/{id}/strategies con mode AUTO e il lavoro arriva in fondo"
      then: "la strategia ha grouping_source SERP, grouping_notice null, un'unica pagina con contentType local che contiene le 20 città e i 2 concorrenti tra le non assegnate"
    - id: AC-6303-2
      given: "lo stesso progetto con OpenRouter simulato che risponde 503 a ogni modello"
      when: "il lavoro di piano arriva in fondo"
      then: "la strategia ha grouping_source SERP e grouping_notice AI_CLASSIFY_UNAVAILABLE; 'noleggio magnetoterapia vicino a me' è nella pagina con contentType local"
    - id: AC-6303-3
      given: "un utente della modalità esperta"
      when: "invia POST /api/projects/{id}/strategies con rules.serpPageOverlap 11"
      then: "la risposta è 400 VALIDATION_ERROR e nessun lavoro di piano è creato"
    - id: AC-6303-4
      given: "il pannello della modalità esperta reso con un fetch simulato"
      when: "l'utente imposta «Risultati in comune per la stessa pagina» a 4 e genera"
      then: "il corpo della richiesta ha rules.serpPageOverlap 4"

  target_tests:
    - file: "tests/integration/plan-run-serp.test.ts"
      covers: [AC-6303-1, AC-6303-2, AC-6303-3]
    - file: "tests/component/strategy-settings.test.tsx"
      covers: [AC-6303-4]

  security_notes:
    - "A04: il motore di riserva garantisce un piano anche se un fornitore esterno manca o risponde male (nessun blocco del flusso)."
    - "A03 / CWE-20: regole nuove validate con limiti come le esistenti (400 VALIDATION_ERROR)."

  out_of_scope:
    - "Rigenerare in automatico i piani esistenti."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-11-12 (D-57, design in `docs/superpowers/specs/2026-11-12-plan-clustering-design.md`): una pagina per intento, temi trovati anche da una sola seed, «titan seo non debba preoccuparsi» del tipo di sito (città in un'unica pagina locale, concorrenti segnalati e non scartati).
- Scelte dell'agente, nel design: soglie 3 (pagina) e 1 (hub) come regole della modalità esperta; classificazione a lotti di 300 con riconoscimenti fissi prima del modello; motore SERP solo con risultati per almeno metà delle prime 1000 keyword.
- La fixture it-magnetoterapia-serp.json nasce alla costruzione dalle keyword reali del progetto dell'utente (175 keyword, 2026-11-12), con risultati e classi scritti a mano o registrati da una chiamata vera, senza dati personali.
- Ordine: dipende dal 61 e dal 62.
- Emendamento dichiarato (T-6303): il given di AC-6201-1 (modulo 62) ha la funzione AI attiva con OpenRouter simulato,
  perché con i risultati di Google la strategia ha grouping_source SERP e senza AI avrebbe il motivo AI_NOT_CONFIGURED;
  il test (`tests/integration/plan-run.test.ts`) attende SERP al posto di ENGINE.
- Note di costruzione (2026-11-13, scelte dell'agente da confermare):
  - la fixture `it-magnetoterapia-serp.json` è scritta a mano (40 keyword sul tema del progetto dell'utente, risultati
    su domini `.example`): l'agente non legge il DB di produzione; le keyword reali del 2026-11-12 restano da provare
    con l'utente;
  - classificazione: migrazione additiva `0055_ai_feature_plan` (valore `plan` dell'enum `AiFeature`); fase nuova
    `classify` fra `serps_collect` e `cluster`, solo con i risultati di Google per almeno metà delle prime 1000
    keyword; 300 keyword per passo della fase, classi place e competitor nel cursore del lavoro; il modello riceve le
    forme canoniche e risponde con le sole keyword place o competitor (le altre sono other), `temperature` 0,
    `max_tokens` 4000; nome di dominio di almeno 4 caratteri; con il tetto della piattaforma raggiunto (non root admin)
    nessuna richiesta e AI_CLASSIFY_UNAVAILABLE; un lavoro ripreso alla fase cluster senza classi usa i soli
    riconoscimenti fissi; dettagli in `docs/AI-TITLES.md`;
  - «contiene, senza spazi e senza punti, il nome del dominio» letto come: la keyword senza punti contiene il nome del
    dominio scritto unito; «noleggio magnetoterapia» con primo risultato `noleggiomagnetoterapia.it` resta other (un
    dominio con le parole della ricerca non fa della ricerca un concorrente);
  - motore: le pagine aprono un hub confrontandosi con la keyword principale della pagina che l'ha aperto (o
    dell'ancora), poi la pilastro è scelta fra le pagine del gruppo; una domanda sotto soglia va nelle FAQ e una pagina
    sotto soglia o oltre il massimo confluisce nella pagina dello stesso hub con più URL in comune (fra tutti gli URL
    delle sue keyword), altrimenti nella pilastro, o nella pagina ancorata se aperta, altrimenti tra le non assegnate;
    contenuto degli spoke dal modificatore della keyword principale come oggi; motivi HUB_SERP con la keyword
    principale, SPOKE_SERP e SPOKE_LOCAL con il numero di keyword;
  - il motivo COMPETITOR resta nel piano del motore (`unassignedReasons`): le keyword non assegnate non hanno una
    colonna per il motivo, quindi la pagina del piano le mostra come oggi; il testo è nei cataloghi;
  - avviso della pagina del piano: con SERP e un motivo il titolo è «Raggruppamento con i risultati di Google» con il
    motivo (AI_CLASSIFY_UNAVAILABLE, AI_NOT_CONFIGURED o un dato mancato), con ENGINE resta «Raggruppamento di riserva»
    anche per SERP_TOO_FEW; fase «Riconosco luoghi e concorrenti»; due campi nuovi della modalità esperta con il testo
    d'aiuto legato da aria-describedby; testi in it, en, es-ES ed es-419 (registro in `docs/I18N-ES.md`).
- Copertura non verificata (dichiarata): nessuna chiamata reale a DataForSEO né a OpenRouter; il piano vero del progetto
  dell'utente e il prompt con un modello vero restano da provare con il suo accesso.
