# 51-es-strategy-ai — Macrotask `es-strategy-ai`

> Spagnolo (D-47), modulo 5 di 5: il piano hub & spoke e i titoli con l'AI in spagnolo, con la variante del paese del progetto: modificatori spagnoli per il raggruppamento, modelli fissi di H1 e H2 con il «¿» delle domande, istruzioni al modello in spagnolo di Spagna o del paese d'America Latina.

## Obiettivo del macrotask
Oggi per lo spagnolo il piano raggruppa solo per parole condivise e i titoli sono la keyword con l'iniziale maiuscola; i titoli con l'AI ricevono istruzioni in inglese. Dopo questo modulo:

- **Raggruppamento**: parole vuote e modificatori spagnoli, come per italiano e inglese.
- **Titoli fissi**: i modelli spagnoli del catalogo (modulo 48) si usano per lo spagnolo; le keyword-domanda prendono «¿» all'inizio e «?» alla fine; il catalogo segue il paese (ES → es-ES, America Latina → es-419).
- **Titoli con l'AI**: istruzioni in spagnolo che chiedono lo spagnolo di Spagna o quello del paese del progetto, con il suo vocabolario.
- **Articoli** (moduli 40-43, emendati con D-47): le stesse regole valgono per gli articoli, costruiti dopo questo modulo.

## Task atomici

```yaml
- id: T-5101
  title: "Piano hub & spoke in spagnolo"
  macrotask: "es-strategy-ai"
  depends_on: [T-5002, T-1901, T-1902, T-4801]

  objective: >
    Raggruppare e titolare le keyword spagnole con la stessa qualità di quelle italiane e inglesi, con titoli che un
    lettore spagnolo o latinoamericano trova naturali.

  definition_of_done:
    - "lib/modules/strategy/modifiers.ts: lessico 'es' con parole vuote (el, la, los, las, un, una, de, del, en, para, por, con, y, o, a, al) e modificatori per categoria (prezzo: precio, barato, económico, gratis; qualità: mejor, mejores, opiniones, reseñas; luogo: cerca de mí, online; uso: para, cómo, qué; confronto: vs, comparativa), con plurali e senza accenti come T-1901."
    - "lib/modules/strategy/titles.ts: 'es' in TITLE_LANGUAGES; catalogo dei modelli scelto dal paese della strategia (ES → es-ES, un paese ispanofono d'America Latina → es-419, altrimenti es-ES); una keyword-domanda in spagnolo diventa H1 con «¿» all'inizio e «?» alla fine, senza raddoppiarli se ci sono già; maiuscola solo sulla prima lettera."
    - "Emendamento dichiarato alla costruzione: T-1901 e T-1902 (modulo 19) elencano lo spagnolo fra le lingue con modificatori e modelli."

  acceptance_criteria:
    - id: AC-5101-1
      given: "keyword spagnole 'cama de hospital', 'cama de hospital precio', 'cama de hospital barata', 'cama de hospital eléctrica' e 'cuánto cuesta una cama de hospital' con la seed 'cama de hospital'"
      when: "si genera la strategia in spagnolo con paese MX"
      then: "c'è una pagina pilastro con keyword principale 'cama de hospital'; 'cama de hospital precio' e 'cama de hospital barata' stanno nella stessa pagina; l'H1 della pagina di 'cuánto cuesta una cama de hospital' inizia con «¿Cuánto» e finisce con «?»"
    - id: AC-5101-2
      given: "la stessa strategia con paese ES e con paese AR"
      when: "si generano gli H1 della pagina pilastro"
      then: "gli H1 usano i modelli del catalogo es-ES con ES e quelli di es-419 con AR, con la maiuscola solo sulla prima lettera"

  target_tests:
    - file: "tests/unit/strategy-es.test.ts"
      covers: [AC-5101-1, AC-5101-2]

  security_notes:
    - "A03 / CWE-79: i titoli restano testo dei cataloghi e delle keyword, resi da React e negli export come oggi."

  out_of_scope:
    - "Modelli di titolo diversi per singolo paese d'America Latina."

- id: T-5102
  title: "Titoli con l'AI in spagnolo per variante"
  macrotask: "es-strategy-ai"
  depends_on: [T-5101, T-3802]

  objective: >
    Far scrivere al modello titoli nello spagnolo del mercato del progetto, con il vocabolario e la punteggiatura di
    quel paese.

  definition_of_done:
    - "lib/ai/titles-prompt.ts: istruzioni in spagnolo per la lingua 'es', con la variante dal paese della strategia: «español de España» per ES, «español de <nombre del país>» (per esempio «español de México») per un paese ispanofono d'America Latina, «español neutro» per gli altri; regole: vocabolario e «ustedes» del mercato, «¿…?» nelle domande, maiuscola solo sulla prima parola, keyword principale nell'H1 nella forma più naturale; il resto come T-3502 (dati, non istruzioni)."
    - "parseTitlesResponse accetta la keyword principale nell'H1 anche con «¿» e accenti diversi (stessa normalizzazione di T-702)."
    - "Emendamento dichiarato: i moduli 40-43, non ancora costruiti, scrivono istruzioni di scaletta, blocchi e FAQ in spagnolo per 'es' con la stessa variante, l'elenco delle formule tipiche dell'AI in spagnolo, i segnaposto «[por verificar: …]» e «[fuente por añadir]» e il titolo «Preguntas frecuentes» (D-47)."

  acceptance_criteria:
    - id: AC-5102-1
      given: "una pagina di un piano in spagnolo con paese MX e un OpenRouter simulato"
      when: "un MEMBER chiede la proposta dei titoli"
      then: "il messaggio di sistema inviato è in spagnolo e contiene «español de México»; con paese ES contiene «español de España»"
    - id: AC-5102-2
      given: "una risposta simulata con H1 «¿Cuánto cuesta alquilar una cama de hospital?» per la keyword principale 'cuanto cuesta alquilar cama hospital'"
      when: "parseTitlesResponse la riceve con language es"
      then: "l'H1 è accettato"

  target_tests:
    - file: "tests/unit/ai-titles-es.test.ts"
      covers: [AC-5102-1, AC-5102-2]

  security_notes:
    - "Privacy (D-42): al modello vanno gli stessi dati di oggi più il nome del paese; nessun dato del progetto o dell'utente."

  out_of_scope:
    - "Elenchi di modelli diversi per lingua."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-47): variante dei contenuti dal paese del progetto (scelta dell'utente), titoli fissi in forme valide nei due mercati, «¿» d'apertura delle domande.
- Ordine (D-47): il modulo 40 dipende da T-5102, così gli articoli si costruiscono dopo lo spagnolo e nascono con le regole delle tre lingue.
- Gate umani: nessuno.
- Scelte dell'agente (approvate con il modulo): spagnolo neutro per un progetto in spagnolo con un paese non ispanofono (per esempio US); elenco iniziale di parole vuote e modificatori.
