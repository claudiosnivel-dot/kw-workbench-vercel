# 42-article-writing — Macrotask `article-writing`

> Articoli con l'AI (D-46), modulo 3 di 7: la scrittura dei blocchi dell'articolo, un blocco per richiesta, con le regole di stile per un testo da persona, nessun dato inventato e i link interni del piano, poi le FAQ.

## Obiettivo del macrotask
Dopo il modulo 41 un articolo ha la scaletta e i blocchi vuoti. Dopo questo modulo:

- **Blocchi scritti**: introduzione e un H2 alla volta, ciascuno con la scaletta intera davanti, la scheda, le note, le sue keyword, il suo tetto di parole e i suoi link; i blocchi compaiono nell'articolo man mano.
- **Stile da persona** (scelta dell'utente): frasi di lunghezza varia, esempi concreti, niente formule tipiche dei testi generati dall'AI; il tetto di parole è un massimo, senza riempitivi.
- **Niente dati inventati**: prezzi, numeri, norme, enti e date solo se sono nella scheda o nelle note; altrimenti il segnaposto `[da verificare: …]`.
- **Testo pulito**: Markdown semplice, link solo verso le pagine del piano, nessun link esterno né HTML.
- **FAQ**: un blocco finale con 3-6 domande e risposte, partendo dalle keyword-domanda della pagina.

## Task atomici

```yaml
- id: T-4201
  title: "Scrittura dei blocchi con lo stile, i segnaposto e i link interni"
  macrotask: "article-writing"
  depends_on: [T-4102]

  objective: >
    Scrivere ogni blocco come lo scriverebbe una persona competente, con le keyword usate in modo naturale, i link
    interni del piano e nessun dato inventato.

  definition_of_done:
    - "lib/articles/section-prompt.ts: istruzioni per lingua (italiano per 'it', spagnolo per 'es' con la variante dal paese come T-5102, inglese con la lingua indicata per le altre) con: tono della scheda; frasi di lunghezza varia e paragrafi brevi; esempi concreti al posto delle generalità; elenco di formule e tratti da evitare (per l'italiano fra gli altri «In conclusione», «In questo articolo», «Nel mondo di oggi», «è importante sottolineare», «non solo… ma anche» ripetuto; per lo spagnolo «En conclusión», «En resumen», «Es importante destacar», «Cabe destacar», «En el mundo actual», «En la era digital», «Sumérgete», «Descubre», «No solo… sino también», «Sin lugar a dudas»; per tutte trattini lunghi, terne forzate, domande retoriche in serie, emoji); keyword assegnate da usare nella forma più naturale, anche flessa; tetto di parole come massimo; vietato inventare prezzi, numeri, percentuali, norme, nomi di enti e date che non siano nella scheda o nelle note, al loro posto il segnaposto della lingua ('[da verificare: …]', '[por verificar: …]', '[to verify: …]'); nessun link esterno, al massimo '[fonte da aggiungere]', '[fuente por añadir]' o '[source to add]'; link interni solo come [testo](page:<id>) verso le pagine della scaletta del blocco, con un testo naturale e vario."
    - "lib/articles/markdown-sanitizer.ts: tiene paragrafi, grassetto, corsivo, elenchi, H3 e i link page:<id> della scaletta del blocco; toglie HTML, titoli di livello 1 e 2, immagini, tabelle, blocchi di codice e ogni altro link lasciandone il testo; un blocco vuoto dopo la pulizia → AI_INVALID_RESPONSE (modello successivo)."
    - "Fase sections del lavoro (T-4101): un blocco per richiesta, nell'ordine; il blocco salva body, model ed edited false; l'introduzione ha la keyword principale nelle prime 100 parole (se manca, AI_INVALID_RESPONSE). Con scope SECTION (T-4002) si riscrive solo il blocco del lavoro, con l'istruzione dell'utente aggiunta ai dati."

  acceptance_criteria:
    - id: AC-4201-1
      given: "un articolo con la scaletta di uno spoke (INTRO e 2 H2, link alla pagina pilastro nell'INTRO) e un OpenRouter simulato che risponde ai blocchi"
      when: "si esegue il lavoro fino alla fine"
      then: "l'articolo ha 3 blocchi con body non vuoto nell'ordine della scaletta, il body dell'INTRO contiene un link page:<id della pagina pilastro> e ai_requests ha 4 righe ok (scaletta e 3 blocchi)"
    - id: AC-4201-2
      given: "un body simulato con '<script>x</script>', '# Titolo', un link https://esterno.example, un link page:<id non nella scaletta> e un elenco puntato"
      when: "sanitizeSectionMarkdown lo riceve"
      then: "il risultato non contiene script, '# ', 'https://esterno.example' né il link page:<id non nella scaletta>, contiene i testi dei link e l'elenco puntato"
    - id: AC-4201-3
      given: "la scheda del progetto senza prezzi e un blocco della scaletta sul costo del noleggio"
      when: "si costruisce la richiesta del blocco"
      then: "le istruzioni vietano di inventare prezzi e indicano il segnaposto '[da verificare: …]'; i dati del blocco contengono il suo tetto di parole e le sue keyword assegnate"

  target_tests:
    - file: "tests/integration/article-sections.test.ts"
      covers: [AC-4201-1]
    - file: "tests/unit/article-markdown-sanitizer.test.ts"
      covers: [AC-4201-2]
    - file: "tests/unit/article-section-prompt.test.ts"
      covers: [AC-4201-3]

  security_notes:
    - "A03 / CWE-79: il testo del modello passa dal sanitizer e si salva come Markdown semplice; l'editor e l'export lo rendono senza HTML del modello."
    - "A03 / CWE-1427: scheda, note e istruzione dell'utente sono dati per il modello; i link ammessi li decide la scaletta controllata."

  out_of_scope:
    - "Controllo dei tratti AI, delle keyword e della densità con la riscrittura (modulo 43)."

- id: T-4202
  title: "FAQ dell'articolo"
  macrotask: "article-writing"
  depends_on: [T-4201]

  objective: >
    Rispondere alle domande che la gente fa su Google sul tema della pagina, in un blocco finale che serve anche ai dati
    strutturati.

  definition_of_done:
    - "Fase faq del lavoro, dopo sections: una richiesta con le keyword-domanda della pagina (isQuestion), le altre secondarie e la scaletta; risposta JSON da 3 a 6 coppie domanda e risposta, domande fino a 150 caratteri che finiscono con '?', risposte da 20 a 120 parole con le stesse regole di stile, segnaposto e pulizia di T-4201; altrimenti AI_INVALID_RESPONSE."
    - "Il blocco FAQ si salva in fondo (kind FAQ, heading «Domande frequenti», «Preguntas frecuentes» o «Frequently asked questions» secondo la lingua) con le coppie in Markdown (una domanda in grassetto e la sua risposta); senza keyword-domanda le domande nascono dalle secondarie."

  acceptance_criteria:
    - id: AC-4202-1
      given: "una pagina con 2 keyword-domanda e un OpenRouter simulato che restituisce 4 coppie valide"
      when: "si esegue il lavoro fino alla fine"
      then: "l'ultimo blocco ha kind FAQ, heading «Domande frequenti» e 4 domande in grassetto che finiscono con '?'; il corpo della richiesta FAQ contiene le 2 keyword-domanda"
    - id: AC-4202-2
      given: "risposte simulate con 2 coppie, con 7 coppie e con una domanda senza '?'"
      when: "parseFaqResponse le riceve"
      then: "ognuna è rifiutata con AI_INVALID_RESPONSE"

  target_tests:
    - file: "tests/integration/article-faq.test.ts"
      covers: [AC-4202-1]
    - file: "tests/unit/article-faq-response.test.ts"
      covers: [AC-4202-2]

  security_notes:
    - "A03 / CWE-79: le coppie passano dallo stesso sanitizer dei blocchi."

  out_of_scope:
    - "FAQ modificabili come coppie separate: nell'editor il blocco FAQ si modifica come gli altri (modulo 44)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): scrittura da persona senza i tratti tipici dell'AI e senza riempitivi (richiesta dell'utente), niente dati inventati con segnaposto da verificare, link interni hub & spoke naturali e funzionali al piano, FAQ.
- Gate umani: nessuno.
- Nota onesta (D-46): dal 2023 Google mostra i risultati FAQ arricchiti quasi solo per siti istituzionali e sanitari; le FAQ restano utili per le ricerche a domanda.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): elenco iniziale delle formule da evitare (si allunga col tempo); FAQ da 3 a 6 coppie con risposte da 20 a 120 parole; nessuna tabella nel testo.
- Emendamento dichiarato (2026-10-18, D-47, prima della costruzione): lo spagnolo (moduli 47-51) si costruisce prima di questo modulo, quindi ogni testo nuovo va nei cataloghi it, en ed es-ES, con le differenze in es-419, e il controllo di parità di T-4702 vale anche per i namespace di questo modulo.
- Emendamento dichiarato (2026-10-18, D-47): istruzioni, formule da evitare, segnaposto e titolo delle FAQ anche in spagnolo.
