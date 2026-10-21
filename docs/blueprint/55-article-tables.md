# 55-article-tables — Macrotask `article-tables`

> Articoli con l'AI (D-46, D-51): le tabelle nel testo dei blocchi, decise dall'utente il 2026-10-21 («permetti le tabelle»). Questo modulo è la prima metà: il modello le scrive, il testo le tiene, l'editor le mostra e i controlli le leggono. Export e WordPress sono il modulo 56.

## Obiettivo del macrotask
Dopo i moduli 42-44 le istruzioni del blocco vietano le tabelle e `sanitizeSectionMarkdown` le toglie del tutto, anche dal testo modificato dall'autore. Per confronti, prezzi e caratteristiche una tabella è spesso la forma più utile. Dopo questo modulo:

- **Tabelle nel testo**: il modello può scrivere una tabella Markdown semplice quando aiuta; una tabella ben formata e nei limiti resta nel testo salvato, con le celle pulite come il resto; una tabella fuori dai limiti si toglie come oggi.
- **Editor e controlli**: l'editor mostra la tabella con l'evidenziazione anche nelle celle; le righe della tabella contano come parole ma non come frasi per i tratti AI.

## Task atomici

```yaml
- id: T-5501
  title: "Tabelle nel testo dei blocchi"
  macrotask: "article-tables"
  depends_on: [T-4201, T-4402]

  objective: >
    Lasciare al modello e all'autore una tabella semplice nel blocco, quando aiuta a confrontare o elencare dati.

  definition_of_done:
    - "lib/articles/section-prompt.ts: le istruzioni del blocco (it, en, es) permettono una tabella Markdown con riga d'intestazione quando aiuta a confrontare o elencare dati (prezzi, caratteristiche, differenze), al massimo 5 colonne e 12 righe di dati, con celle di solo testo, grassetto o corsivo; il resto delle regole resta com'è (niente HTML, immagini, codice, titoli # o ##). Le istruzioni delle FAQ (T-4202) restano senza tabelle."
    - "lib/articles/markdown-sanitizer.ts: sanitizeSectionMarkdown tiene una tabella GFM ben formata (intestazione, riga di separazione con gli allineamenti, righe con lo stesso numero di celle dell'intestazione, da 2 a 5 colonne e da 1 a 12 righe di dati) con le celle pulite come il testo (link page: delle pagine del blocco tenuti, link esterni, indirizzi web e HTML tolti lasciando il testo, `\\|` dentro una cella conservato); una tabella che non rispetta queste regole si toglie tutta, come oggi. Vale anche per il testo dell'autore salvato dall'editor (T-4402), che passa dallo stesso sanitizer."

  acceptance_criteria:
    - id: AC-5501-1
      given: "il modello che scrive il blocco H2_1 con un paragrafo e una tabella di 3 colonne, con intestazione e 4 righe di dati, senza tratti AI né problemi SEO"
      when: "il lavoro dell'articolo arriva alla fine"
      then: "il testo salvato del blocco H2_1 contiene il paragrafo e la tabella con l'intestazione, la riga di separazione e le 4 righe nello stesso ordine"
    - id: AC-5501-2
      given: "un testo con un paragrafo e una tabella che ha una riga di 4 celle sotto un'intestazione di 3"
      when: "sanitizeSectionMarkdown lo pulisce"
      then: "il risultato è il solo paragrafo"
    - id: AC-5501-3
      given: "un testo con un paragrafo e una tabella di 6 colonne"
      when: "sanitizeSectionMarkdown lo pulisce"
      then: "il risultato è il solo paragrafo"
    - id: AC-5501-4
      given: "una tabella di 2 colonne con una cella «[sito](https://esempio.it) <b>forte</b>»"
      when: "sanitizeSectionMarkdown la pulisce"
      then: "la tabella resta e quella cella contiene «sito forte»"

  target_tests:
    - file: "tests/integration/article-tables.test.ts"
      covers: [AC-5501-1]
    - file: "tests/unit/article-markdown-sanitizer.test.ts"
      covers: [AC-5501-2, AC-5501-3, AC-5501-4]

  security_notes:
    - "A03 / CWE-79: le celle passano dalla stessa pulizia del testo, senza HTML né link esterni."
    - "A04 / CWE-770: al massimo 5 colonne e 12 righe per tabella."

  out_of_scope:
    - "Tabelle nelle FAQ; celle con elenchi, immagini o più paragrafi; export e WordPress (modulo 56)."

- id: T-5502
  title: "Tabelle nell'editor e nei controlli"
  macrotask: "article-tables"
  depends_on: [T-5501, T-4301, T-4401]

  objective: >
    Far leggere all'autore la tabella nell'editor, con i punti da controllare evidenziati anche nelle celle.

  definition_of_done:
    - "components/article/article-markdown.tsx: react-markdown legge la sola sintassi delle tabelle GFM (micromark-extension-gfm-table e mdast-util-gfm-table come dipendenze dirette con versione esatta, le stesse dell'export del modulo 56) e rende <table> con <thead> e <tbody> con le classi del tema; l'evidenziazione dei tratti AI e dei dati da verificare funziona anche dentro le celle."
    - "lib/articles/style-check.ts: le righe di una tabella non sono frasi per le aperture ripetute e le domande retoriche (una tabella non è un tratto AI); le parole delle celle contano in words, e le regole dei dati da verificare valgono anche nelle celle. Il controllo SEO (T-4302) conta le parole delle celle come il resto del blocco."

  acceptance_criteria:
    - id: AC-5502-1
      given: "l'editor reso con un blocco che ha una tabella di 3 colonne e, in una cella, l'importo «90 €» segnato nei controlli come dato da verificare"
      when: "l'utente legge l'articolo"
      then: "il blocco mostra una tabella con 3 intestazioni e l'importo «90 €» evidenziato come dato da verificare"
    - id: AC-5502-2
      given: "un blocco con un paragrafo e una tabella di 4 righe di dati che cominciano tutte con «Letto»"
      when: "analyzeStyle analizza il blocco"
      then: "non c'è un ai_pattern con rule repeated_openings e words conta anche le parole delle celle"

  target_tests:
    - file: "tests/component/article-editor-read.test.tsx"
      covers: [AC-5502-1]
    - file: "tests/unit/article-style-check.test.ts"
      covers: [AC-5502-2]

  security_notes:
    - "A03 / CWE-79: la tabella si rende come elementi di React dal Markdown pulito, senza HTML grezzo."

  out_of_scope:
    - "Modifica della tabella con un editor visuale (l'autore la modifica nel testo Markdown del blocco)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-10-21 (D-51) alla domanda sulle tabelle del modulo 42: «permetti le tabelle», diviso in due moduli piccoli (testo ed editor qui, export e WordPress nel 56), dopo il 54.
- Gate umani: nessuno (la tabella compare dentro un blocco; nessuna baseline visiva la contiene).
- Ordine: dipende da 42, 43 e 44, già chiusi; viene dopo il 54 su indicazione dell'utente e prima del 56.
