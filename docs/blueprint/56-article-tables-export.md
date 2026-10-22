# 56-article-tables-export — Macrotask `article-tables-export`

> Articoli con l'AI (D-46, D-51): seconda metà delle tabelle decise dall'utente il 2026-10-21. Dopo il modulo 55 il blocco può avere una tabella; questo modulo la porta nell'export (HTML, Markdown, .docx) e quindi nella bozza inviata a WordPress.

## Obiettivo del macrotask
Dopo il modulo 45 `parseMarkdown` legge il Markdown senza le estensioni GFM: una tabella del blocco arriverebbe nell'export come paragrafi con le barre. Dopo questo modulo:

- **HTML e Markdown**: la tabella diventa `<table>` nell'HTML (anche quello inviato a WordPress) e resta una tabella GFM nel Markdown, con i link interni risolti come nel resto del blocco.
- **Word**: nel file .docx la tabella è una tabella di Word con la riga d'intestazione.

## Task atomici

```yaml
- id: T-5601
  title: "Tabelle nell'export HTML e Markdown e nella bozza di WordPress"
  macrotask: "article-tables-export"
  depends_on: [T-5501, T-4501, T-4602]

  objective: >
    Portare la tabella del blocco nell'articolo copiato, scaricato o inviato a WordPress.

  definition_of_done:
    - "lib/articles/render.ts: parseMarkdown legge le tabelle GFM con micromark-extension-gfm-table e mdast-util-gfm-table (le dipendenze del modulo 55); renderArticleHtml scrive <table> con <thead> (celle <th>) e <tbody>, con l'allineamento della riga di separazione, il testo delle celle escapato e i link page: risolti come nei paragrafi (T-4501); renderArticleMarkdown scrive la tabella GFM con le celle escapate."
    - "L'HTML inviato a WordPress (T-4602) è quello di renderArticleHtml senza H1, quindi la bozza riceve la tabella senza altro codice."

  acceptance_criteria:
    - id: AC-5601-1
      given: "un articolo pronto con un blocco che ha una tabella di 2 colonne e 2 righe di dati, con in una cella il link page: a una pagina del piano segnata come pubblicata"
      when: "un MEMBER del progetto scarica l'export in formato html"
      then: "il file contiene una <table> con un <thead> di 2 <th>, 2 righe nel <tbody> e, nella cella, un link con l'indirizzo della pagina pubblicata"
    - id: AC-5601-2
      given: "lo stesso articolo"
      when: "un MEMBER del progetto scarica l'export in formato md"
      then: "il file contiene la tabella con la riga d'intestazione, la riga di separazione e le 2 righe di dati, con il link della cella risolto"
    - id: AC-5601-3
      given: "un articolo pronto salvato direttamente nel database con una cella di tabella «<script>alert(1)</script>»"
      when: "un MEMBER del progetto scarica l'export in formato html"
      then: "il file contiene «&lt;script&gt;» dentro la cella e nessun elemento <script> fuori dai dati strutturati"

  target_tests:
    - file: "tests/integration/article-export-tables.test.ts"
      covers: [AC-5601-1, AC-5601-2, AC-5601-3]

  security_notes:
    - "A03 / CWE-79: il testo delle celle è escapato nell'HTML come quello dei paragrafi."

  out_of_scope:
    - "Stili della tabella nel tema di WordPress; tabelle nei dati strutturati."

- id: T-5602
  title: "Tabelle nel file .docx"
  macrotask: "article-tables-export"
  depends_on: [T-5601, T-4502]

  objective: >
    Avere nel file Word la tabella del blocco come tabella vera, pronta da impaginare.

  definition_of_done:
    - "lib/articles/docx.ts: una tabella del blocco diventa una tabella di Word (Table di docx) a tutta larghezza, con la riga d'intestazione ripetuta in cima a ogni pagina e il suo testo in grassetto, il testo delle celle con grassetto e corsivo e i link risolti come nei paragrafi (T-4502)."

  acceptance_criteria:
    - id: AC-5602-1
      given: "un articolo pronto con un blocco che ha una tabella di 3 colonne e 2 righe di dati"
      when: "un MEMBER del progetto scarica l'export in formato docx"
      then: "word/document.xml contiene una w:tbl con 3 righe, 3 celle per riga, la prima riga con w:tblHeader e il testo delle celle nell'ordine della tabella"

  target_tests:
    - file: "tests/integration/article-docx-tables.test.ts"
      covers: [AC-5602-1]

  security_notes:
    - "A03 / CWE-79: il testo delle celle entra nel file come testo, mai come XML."

  out_of_scope:
    - "Stili personalizzati della tabella nel file Word (larghezze delle colonne, colori)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-10-21 (D-51): seconda metà delle tabelle, diviso dal 55 per la regola dei macrotask piccoli.
- Gate umani: nessuno (nessuna schermata nuova, nessuna baseline visiva toccata).
- Ordine: dipende da 45, 46 e 55; si costruisce dopo il 55.
- Note di costruzione (2026-10-22, scelte dell'agente da confermare dall'utente):
  - `parseMarkdown` legge la sola estensione GFM delle tabelle, come l'editor (T-5502): link automatici, barrato e note
    restano testo come prima; anche le FAQ dei dati strutturati passano dallo stesso parser (una tabella lì diventa il
    testo delle celle, ma le risposte delle FAQ non ne hanno: `tables: false` del 55);
  - l'allineamento della riga di separazione va nell'HTML come attributo `align` di `<th>` e `<td>`, come nell'HTML
    di riferimento di GFM, e non come `style`: un sito con una Content-Security-Policy senza `unsafe-inline` ignorerebbe
    lo stile in linea; i valori vengono da un elenco chiuso (left, center, right);
  - le righe con meno celle dell'intestazione hanno celle vuote e quelle in più si tolgono, come in GFM, nell'HTML, nel
    Markdown e nel file Word; una tabella senza righe di dati ha solo il `<thead>`;
  - nel Markdown le tabelle del primo livello del blocco si riscrivono riga per riga dal testo di ogni cella (escape
    compresi) e con l'allineamento; il resto del blocco si copia come prima. Nell'indirizzo risolto di un link dentro
    una cella il `|` diventa `\|`, così la riga della tabella resta intera; fuori dalle tabelle l'indirizzo non cambia;
  - nel file Word la tabella è larga il 100% della pagina con le colonne uguali (le calcola `docx` 9.8.1), i bordi
    sottili predefiniti di `docx` e l'allineamento della colonna nei paragrafi delle celle;
  - test in più oltre agli AC: nel test unitario dell'export allineamenti, celle mancanti e in più, attributi `href` e
    `align` soli, tabella uguale senza H1 (la bozza di WordPress), `\|` nella cella e nell'indirizzo con la rilettura
    della tabella; nel test del file Word il grassetto dell'intestazione e il link di una cella.
- Copertura non verificata (dichiarata): nessuna prova con un sito WordPress vero né con Word, LibreOffice o Google
  Documenti aperti a mano; AC-5601-2 era già verde prima del codice (il Markdown copiava il blocco già regolare del 55);
  il potere delle asserzioni (AT-1 Fase C) non è eseguito.
