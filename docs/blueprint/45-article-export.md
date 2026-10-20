# 45-article-export — Macrotask `article-export`

> Articoli con l'AI (D-46), modulo 6 di 7: l'articolo esce dall'app con «Copia» per il CMS e con i download .html, .md e .docx, con i link interni risolti, i dati strutturati e i segnaposto immagine; «Segna come pubblicata» registra l'indirizzo della pagina per i link degli altri articoli.

## Obiettivo del macrotask
Dopo il modulo 44 l'articolo si legge e si modifica nell'app. Dopo questo modulo:

- **Link risolti**: ogni link `page:<id>` diventa l'URL pubblicato della pagina, se c'è, altrimenti l'indirizzo del sito più lo slug, altrimenti `/slug/`.
- **Copia e download**: HTML con i dati strutturati (JSON-LD `Article`, `FAQPage`, `BreadcrumbList` e `LocalBusiness` per le pagine locali con nome e indirizzo nella scheda), i segnaposto immagine come commenti; Markdown; .docx.
- **Pubblicata**: «Segna come pubblicata» con l'URL porta la pagina a «Pubblicata» e salva l'indirizzo; con segnaposto `[da verificare]` ancora aperti, copia, download e invio chiedono conferma.

## Task atomici

```yaml
- id: T-4501
  title: "HTML, Markdown e dati strutturati con i link risolti"
  macrotask: "article-export"
  depends_on: [T-4402, T-4001]

  objective: >
    Trasformare l'articolo nel formato che l'utente incolla nel suo sito, con i link interni che puntano alle pagine
    giuste e i dati strutturati pronti.

  definition_of_done:
    - "Migrazione additiva 0051_page_published_url: strategy_pages.published_url (fino a 500 caratteri, null), copiato con la pagina da «Rigenera» (T-2502)."
    - "lib/articles/render.ts, puro: renderArticleHtml e renderArticleMarkdown con H1, blocchi nell'ordine (INTRO senza titolo, H2, FAQ), Markdown convertito in HTML senza attributi diversi da href e alt; link page:<id> risolti con published_url della pagina, altrimenti site_url del progetto più '/' più lo slug del suo articolo (o lo slug ricavato dalla keyword principale) più '/', altrimenti '/' più lo slug più '/'; segnaposto immagine come commento HTML con testo alternativo, nome file e prompt (in Markdown come citazione); i testi dentro i commenti senza '--'."
    - "JSON-LD in un solo script application/ld+json: Article (headline = H1, description = meta_description, inLanguage); FAQPage dalle coppie del blocco FAQ; BreadcrumbList dalla pagina pilastro allo spoke con gli URL risolti; LocalBusiness solo per content_type local con business_name e business_address della scheda. Ogni '<' dentro il JSON scritto come \\u003c."
    - "Editor: «Copia» mette negli appunti text/html (con lo script) e text/plain (il Markdown); «Scarica» offre .html e .md (Content-Disposition attachment, nome dallo slug) da GET .../article/export?format=html|md con i permessi di lettura del piano."

  acceptance_criteria:
    - id: AC-4501-1
      given: "uno spoke con un link alla sua pagina pilastro, la pagina pilastro con published_url 'https://www.esempio.it/noleggio/' e un altro link verso uno spoke senza URL, con site_url 'https://www.esempio.it' e slug 'letto-elettrico'"
      when: "renderArticleHtml riceve l'articolo"
      then: "il primo link ha href 'https://www.esempio.it/noleggio/' e il secondo 'https://www.esempio.it/letto-elettrico/'; senza site_url il secondo ha href '/letto-elettrico/'"
    - id: AC-4501-2
      given: "un articolo con un blocco FAQ di 3 coppie, uno spoke di una pagina pilastro e un segnaposto immagine"
      when: "renderArticleHtml riceve l'articolo"
      then: "l'HTML contiene un solo script application/ld+json con @type Article, FAQPage con 3 domande e BreadcrumbList con 2 elementi, e un commento HTML con il testo alternativo e il prompt del segnaposto"
    - id: AC-4501-3
      given: "un body con un testo '</script><script>alert(1)</script>' nella risposta di una FAQ"
      when: "renderArticleHtml riceve l'articolo"
      then: "l'HTML contiene un solo tag script, quello application/ld+json, e il testo compare come \\u003c/script> dentro il JSON"
    - id: AC-4501-4
      given: "un MEMBER del progetto e un utente di un altro workspace"
      when: "chiedono GET .../article/export?format=md"
      then: "il MEMBER riceve 200 con Content-Disposition attachment e nome file dallo slug con .md; l'altro utente riceve 404"

  target_tests:
    - file: "tests/unit/article-render.test.ts"
      covers: [AC-4501-1, AC-4501-2, AC-4501-3]
    - file: "tests/integration/article-export.test.ts"
      covers: [AC-4501-4]

  security_notes:
    - "A03 / CWE-79: l'HTML nasce solo dal Markdown ripulito (T-4201) con un elenco chiuso di tag e attributi; il JSON-LD scrive '<' come \\u003c."
    - "A01 / CWE-639: l'export risolve l'articolo nel progetto del workspace della sessione."

  out_of_scope:
    - "Indice dei contenuti nell'HTML: lo aggiunge il CMS o il tema."

- id: T-4502
  title: "File .docx, «Segna come pubblicata» e conferma dei segnaposto"
  macrotask: "article-export"
  depends_on: [T-4501, T-2501]

  objective: >
    Dare l'articolo anche in Word, chiudere il ciclo della pagina con il suo indirizzo e non far uscire per errore un
    testo con dati ancora da verificare.

  definition_of_done:
    - "GET .../article/export?format=docx con la libreria docx (versione fissata, osv pulito): H1 come titolo, H2 e H3 come intestazioni, grassetti, corsivi ed elenchi, link interni risolti come in T-4501, segnaposto immagine come paragrafi in corsivo; niente JSON-LD."
    - "«Segna come pubblicata» nell'editor: finestra con l'URL della pagina (https assoluto, fino a 500 caratteri, precompilato con site_url più lo slug) → PATCH della pagina del piano con status PUBLISHED e published_url (T-2501 accetta il nuovo campo; 400 VALIDATION_ERROR per un URL non valido); l'URL si può cambiare in seguito dalla stessa finestra."
    - "Prima di «Copia», «Scarica» e (modulo 46) «Invia a WordPress», se i checks dei blocchi hanno segnaposto '[da verificare: …]' o '[fonte da aggiungere]' aperti, una finestra dice quanti sono con «Continua lo stesso» e «Torna al testo»."

  acceptance_criteria:
    - id: AC-4502-1
      given: "un articolo con un H2, un elenco puntato e un link interno risolto"
      when: "un MEMBER chiede GET .../article/export?format=docx"
      then: "la risposta è 200 con il tipo application/vnd.openxmlformats-officedocument.wordprocessingml.document e il documento letto contiene l'H1, l'H2 come intestazione, le voci dell'elenco e l'URL del link"
    - id: AC-4502-2
      given: "un MEMBER e una pagina WRITING"
      when: "invia PATCH della pagina con status PUBLISHED e published_url 'https://www.esempio.it/noleggio/', poi con published_url 'ftp://esempio.it'"
      then: "la prima risposta è 200 e la pagina è PUBLISHED con quell'URL; la seconda è 400 VALIDATION_ERROR"
    - id: AC-4502-3
      given: "l'editor reso con un articolo che ha 2 segnaposto '[da verificare: …]'"
      when: "l'utente clicca «Copia»"
      then: "compare la finestra con «2 dati da verificare» e gli appunti non cambiano finché l'utente non clicca «Continua lo stesso»"

  target_tests:
    - file: "tests/integration/article-docx.test.ts"
      covers: [AC-4502-1]
    - file: "tests/integration/page-published-url.test.ts"
      covers: [AC-4502-2]
    - file: "tests/component/article-placeholder-confirm.test.tsx"
      covers: [AC-4502-3]

  security_notes:
    - "A06 / CWE-1104: nuova dipendenza docx a versione fissata, controllata da osv-scanner nel checkpoint."
    - "A03 / CWE-601: published_url solo https assoluto, mostrato come link solo nell'editor del proprio progetto."

  out_of_scope:
    - "Google Docs (opzione scartata dall'utente il 2026-10-18); invio a WordPress (modulo 46)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): «Copia» e download .docx, .html e .md; dati strutturati Article, FAQPage, BreadcrumbList e LocalBusiness; link interni hub & spoke risolti (aggiunta dell'utente); segnaposto immagine nell'export.
- Gate umani: nessuno.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): URL di ripiego site_url più slug con la barra finale; segnaposto immagine come commenti HTML; conferma con il numero dei segnaposto aperti; libreria docx per il file Word.
- Emendamento dichiarato (2026-10-18, D-47, prima della costruzione): lo spagnolo (moduli 47-51) si costruisce prima di questo modulo, quindi ogni testo nuovo va nei cataloghi it, en ed es-ES, con le differenze in es-419, e il controllo di parità di T-4702 vale anche per i namespace di questo modulo.
- Emendamento dichiarato (2026-10-18, D-47): la migrazione diventa 0051.
- Emendamento dichiarato (2026-10-20, costruzione): AC-4501-4 parlava di un VIEWER, ruolo che non esiste (D-08: OWNER,
  ADMIN e MEMBER, come per AC-4001-3 nel modulo 40); il criterio parla ora di un MEMBER, il ruolo più basso con
  project.read. Il comportamento del DoD («con i permessi di lettura del piano») è invariato.
- Note di costruzione (2026-10-20, scelte dell'agente da confermare dall'utente):
  - il campo del corpo della PATCH della pagina è `publishedUrl`, in camelCase come `contentType` (T-1904); la colonna è
    `published_url`. L'indirizzo accettato è https assoluto con un host, senza credenziali, fino a 500 caratteri, salvato
    com'è (senza togliere la barra finale); cambiare lo stato in seguito non lo cancella;
  - il Markdown dei blocchi si legge con `mdast-util-from-markdown` 2.1.0 (già nell'albero tramite react-markdown, ora
    dipendenza diretta a versione fissata); l'HTML lo scrive il codice con i soli tag p, h3-h6, ul, ol, li, blockquote,
    strong, em, br e a con href; HTML grezzo e codice restano testo con le entità; un link page: verso una pagina fuori
    dal piano resta testo;
  - i segnaposto immagine vanno dopo il loro blocco con numero, copertina, testo alternativo, nome del file e prompt
    nella lingua del piano (it, es, altrimenti en); nei commenti anche '<' e '>' diventano entità, così nessun tag
    compare neppure lì;
  - il JSON-LD è un solo `@graph` (Article con headline, description e inLanguage; FAQPage dalle coppie del blocco FAQ:
    un paragrafo tutto in grassetto è la domanda, i blocchi che seguono la risposta; BreadcrumbList; LocalBusiness con
    nome e indirizzo entrambi presenti);
  - l'export .html è il frammento da incollare (H1, blocchi e script), senza `<html>` né `<head>`; il nome del file è lo
    slug in ASCII (altrimenti «article»); lo slug di una pagina senza articolo è quello che la scaletta ricaverebbe
    dalla keyword principale (`articleSlug` di T-4102, ora esportata);
  - «Copia» chiede i due export al server e li mette negli appunti con un ClipboardItem (text/html e text/plain), con le
    Promise dentro il ClipboardItem così il clic resta valido; senza ClipboardItem copia solo il Markdown come testo;
    copia e download sono spenti mentre un lavoro è attivo;
  - nel file Word H2 è «Heading 2» e H3 «Heading 3» (H1 «Title»), gli elenchi numerati ripartono da 1 a ogni elenco;
  - «Segna come pubblicata» usa la version del piano letta dall'editor; un 409 STRATEGY_CONFLICT chiede di ricaricare la
    pagina; con la pagina pubblicata il pulsante diventa «Cambia l'indirizzo» e l'indirizzo compare come link;
  - target test scritti dopo il codice di render e migrazione (il comportamento asserito viene dagli AC).
