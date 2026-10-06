# 08-results-export — Macrotask `results-export`

> Pagina risultati, azioni massive, export (CSV/XLSX/JSON/Google Sheets), sezioni, impostazioni di progetto e dashboard: nasce dai rilievi «progetti/export» dell'audit 2026-10-02 e dai 7 fix di paginazione dell'audit 2026-05-31 ancora aperti.

## Obiettivo del macrotask

Fare in modo che ciò che l'utente vede sia ciò che modifica ed esporta: paginazione stabile con parametri coerenti, una vista (sezione o progetto) risolta in un solo punto e riusata da tabella ed export, azioni massive che possono coprire l'intero set filtrato, file CSV che si aprono in Excel italiano senza eseguire formule, export che non si fermano al limite di 4,5 MB delle risposte Vercel, export Google Sheets che non lasciano file orfani, sezioni e impostazioni con errori espliciti invece di 500 o valori azzerati, dashboard con tutti i progetti raggiungibili.
Ogni query resta filtrata per il progetto posseduto dall'utente (oggi owner_user_id; per membership di workspace da T-1502). La logica estratta dalle pagine va in `lib/modules/**` (strato domain, D-22): pagine e route la chiamano, non la duplicano.

## Task atomici

```yaml
- id: T-801
  title: "Paginazione dei risultati stabile e corretta"
  macrotask: "results-export"
  depends_on: [T-105]

  objective: >
    app/projects/[id]/results/page.tsx e app/api/projects/[id]/results/route.ts paginano con skip/take
    su orderBy [score desc, keyword asc] senza tiebreaker, quindi a parità di punteggio e keyword una
    riga può comparire in due pagine o in nessuna. parsePositiveInt('') restituisce 1 e la pagina
    applica il minimo 50 invece del default 100; la pagina usa il range 50-250 e l'API 20-500. La
    findMany parte solo dopo i count (round-trip in più), si eseguono 3 count anche quando 2 bastano,
    e i parametri di query sono ricostruiti in 5 blocchi copiati. Il task estrae parametri, query e
    link in moduli di dominio condivisi.

  definition_of_done:
    - "lib/modules/results-paging.ts: costanti PAGE_SIZE_DEFAULT = 100, PAGE_SIZE_MIN = 20, PAGE_SIZE_MAX = 250; parsePagingParams(source) restituisce { page, pageSize } (vuoto, non numerico, zero o negativo -> default; decimali troncati; pageSize limitato al range); withPaging(params, overrides) restituisce un nuovo URLSearchParams con page/pageSize sostituiti e gli altri parametri invariati."
    - "lib/modules/results-query.ts: loadResultsPage({ projectId, subprojectId, filters, page, pageSize }) esegue in parallelo 2 count (filtrati e totale della vista: sezione o progetto) e la findMany della pagina richiesta; se la pagina richiesta supera totalPages ripete solo la findMany sull'ultima pagina; restituisce rows, filteredCount, scopeTotalCount, page, totalPages, pageStart, pageEnd."
    - "Ordinamento con la costante RESULTS_ORDER_BY di lib/modules/results-order.ts, che termina sempre con { id: 'asc' } (il file è creato dal primo tra T-707 e T-801)."
    - "app/projects/[id]/results/page.tsx e GET app/api/projects/[id]/results/route.ts usano parsePagingParams, loadResultsPage e withPaging; i 4 blocchi di link (sezione attiva, tutto il progetto, pagina precedente, successiva) passano da withPaging (il quinto, buildExportLink, è sostituito da T-802); il testo «Totale progetto» non richiede più un terzo count."
    - "tests/unit/results-paging-params.test.ts e tests/integration/results-pagination.test.ts con commento covers per AC."

  acceptance_criteria:
    - id: AC-801-1
      given: "i valori di query page in '', 'abc', '0', '-3', '2.7', '3' e pageSize in '', 'abc', '10', '150', '1000'"
      when: "si chiama parsePagingParams"
      then: "page vale 1, 1, 1, 1, 2, 3; pageSize vale 100, 100, 20, 150, 250"
    - id: AC-801-2
      given: "URLSearchParams 'searchText=scarpe&page=3&pageSize=50&view=all'"
      when: "si chiama withPaging con { page: 1 }"
      then: "il risultato serializzato contiene esattamente una volta page=1, contiene pageSize=50, searchText=scarpe e view=all, e l'oggetto di partenza contiene ancora page=3"
    - id: AC-801-3
      given: "120 candidate con score 50 identico, con le 60 keyword 'kw-001'..'kw-060' presenti sia nella sezione A sia nella sezione B dello stesso progetto, vista tutto il progetto e pageSize 20"
      when: "si leggono le pagine da 1 a 6 con loadResultsPage e con GET /api/projects/[id]/results?page=N&pageSize=20 (emendato da T-1101 il 2026-10-06: la GET API è rimossa, si legge solo con loadResultsPage e totalPages vale 6)"
      then: "in entrambi i casi l'unione delle 6 pagine contiene 120 id distinti, nessun id compare in due pagine, e la risposta API ha meta.totalPages = 6"
    - id: AC-801-4
      given: "una vista con 205 candidate filtrate, pageSize 100 e spy su prisma.keywordCandidate.count e findMany"
      when: "si chiama loadResultsPage con page 2 e poi con page 99"
      then: "con page 2: count chiamato 2 volte, findMany 1 volta, 100 righe; con page 99: page = 3, totalPages = 3, 5 righe, pageStart = 201, pageEnd = 205 e findMany chiamato 2 volte in totale per quella richiesta"

  target_tests:
    - file: "tests/unit/results-paging-params.test.ts"
      covers: [AC-801-1, AC-801-2]
    - file: "tests/integration/results-pagination.test.ts"
      covers: [AC-801-3, AC-801-4]

  security_notes:
    - "A01 Broken Access Control, CWE-639 (Authorization Bypass Through User-Controlled Key): loadResultsPage riceve un projectId già verificato come posseduto dall'utente e il where include sempre project_id; un subprojectId di altro progetto continua a dare 404 (comportamento fotografato da T-105)."
    - "A06 Insecure Design, CWE-770 (Allocation of Resources Without Limits): pageSize è limitato a 250 lato server sia nella pagina sia nell'API; page oltre l'ultima viene ricondotta all'ultima pagina invece di eseguire skip arbitrari."

  out_of_scope:
    - "Ordinamento per sorgente del punteggio (D-18): T-707. Indice per ORDER BY score, keyword, id: T-1103."
    - "Rimozione della GET API dei risultati senza chiamanti: T-1101 (qui viene solo allineata)."

- id: T-802
  title: "La sezione mostrata è quella esportata; sezione predefinita reale"
  macrotask: "results-export"
  depends_on: [T-801]

  objective: >
    Senza parametri la pagina risultati mostra la prima sezione per posizione, ma buildExportLink copia
    i searchParams grezzi: l'export non riceve subprojectId e prende tutto il progetto. Il campo
    projects.default_subproject_id viene scritto (creazione sezione, rotta default-subproject) ma mai
    letto, e components/set-default-section-button.tsx non è montato da nessuna pagina (D-21). I link
    «Risultati» della dashboard e «Vedi risultati tutto progetto» della pagina sezione portano alla
    vista sezione invece che al progetto intero. Il task risolve la vista in un solo modulo.

  definition_of_done:
    - "lib/modules/results-view.ts: resolveResultsView({ subprojects, defaultSubprojectId, searchParams }) restituisce { kind: 'section', subprojectId } oppure { kind: 'all' } oppure { kind: 'not-found' }; ordine di precedenza: view=all, poi subprojectId richiesto, poi default_subproject_id se appartiene al progetto, poi la prima sezione per posizione."
    - "lib/modules/results-view.ts: buildResultsExportHref(projectId, view, searchParams, format, scope) e resultsHref(projectId, target); l'href di export porta subprojectId della vista risolta e non porta page né pageSize."
    - "app/projects/[id]/results/page.tsx usa resolveResultsView per tabella, conteggi, link CSV/XLSX/JSON e pulsante Google Sheets; app/page.tsx (link Risultati -> view=all), app/projects/[id]/subprojects/[subprojectId]/page.tsx (tutto progetto -> view=all), app/projects/[id]/page.tsx e app/projects/[id]/sections/page.tsx costruiscono i link con resultsHref."
    - "D-21: app/projects/[id]/sections/page.tsx monta SetDefaultSectionButton per ogni sezione (isDefault = default_subproject_id); app/projects/[id]/page.tsx e POST app/api/projects/[id]/run/route.ts senza subprojectId usano la sezione predefinita; la voce del file nella baseline knip di T-108 viene rimossa."
    - "tests/unit/results-view.test.ts con commento covers per AC."

  acceptance_criteria:
    - id: AC-802-1
      given: "sezioni S1 (posizione 0) e S2 (posizione 1) e searchParams vuoti"
      when: "si chiama resolveResultsView con defaultSubprojectId = S2, poi con un id che non appartiene al progetto, poi con null"
      then: "il primo risultato è { kind: 'section', subprojectId: S2 }; il secondo e il terzo sono { kind: 'section', subprojectId: S1 }"
    - id: AC-802-2
      given: "sezioni S1 e S2, default S2"
      when: "si chiama resolveResultsView con view=all, con subprojectId=S1, con subprojectId=altro-id e con view=all&subprojectId=S1"
      then: "i risultati sono nell'ordine { kind: 'all' }, { kind: 'section', subprojectId: S1 }, { kind: 'not-found' }, { kind: 'all' }"
    - id: AC-802-3
      given: "vista { kind: 'section', subprojectId: S2 } e searchParams searchText=scarpe, page=3, pageSize=50"
      when: "si chiama buildResultsExportHref con format csv e scope approved, poi con vista { kind: 'all' }"
      then: "il primo href ha path /api/projects/P/export e query con subprojectId=S2, searchText=scarpe, format=csv, scope=approved e senza page né pageSize; il secondo href non contiene subprojectId"
    - id: AC-802-4
      given: "i file app/**/*.tsx del repository e resultsHref"
      when: "il test esegue resultsHref('P', { view: 'all' }) e cerca nei sorgenti href verso /projects/<id>/results privi di query"
      then: "resultsHref restituisce '/projects/P/results?view=all' e la scansione trova 0 occorrenze di href verso /results senza view o subprojectId"

  target_tests:
    - file: "tests/unit/results-view.test.ts"
      covers: [AC-802-1, AC-802-2, AC-802-3, AC-802-4]

  security_notes:
    - "A01 Broken Access Control, CWE-639: default_subproject_id è usato solo se appartiene alle sezioni del progetto già caricate con il filtro di proprietà; il subprojectId messo nell'href di export continua a essere riverificato dalla route di export (sezione del progetto posseduto, altrimenti 404)."

  out_of_scope:
    - "Coerenza degli scope di export con revisione e filtri: T-807."
    - "Rimozione del codice morto restante: T-1101."

- id: T-803
  title: "Azioni massive su tutto il set filtrato"
  macrotask: "results-export"
  depends_on: [T-801]

  objective: >
    In components/results-table.tsx «Seleziona tutto» seleziona solo le righe della pagina, la
    selezione non si azzera al cambio di pagina o filtri (si applica un'azione a righe non più
    visibili) e non esiste modo di approvare tutte le keyword filtrate. La PATCH di
    app/api/projects/[id]/results/route.ts accetta ids senza verificarne tipo e numero. Il task
    aggiunge l'azione sul set filtrato e valida il payload.

  definition_of_done:
    - "PATCH app/api/projects/[id]/results/route.ts accetta { action, ids } oppure { action, filters, subprojectId }: con filters esegue updateMany con where = buildResultsWhere(projectId, parseResultsFilters(filters), subprojectId); risponde { success: true, updated: <numero righe aggiornate> }."
    - "Validazione: action tra approve, reject, mark-review, select, unselect; ids array di stringhe non vuote, massimo 1000; esattamente uno tra ids e filters; altrimenti 400."
    - "components/results-table.tsx riceve filteredCount e filters; dopo «Seleziona tutto» mostra l'offerta «Seleziona tutte le <N> keyword filtrate» se N è maggiore delle righe in pagina; la selezione si azzera quando cambiano le righe ricevute (pagina, filtri, vista)."
    - "tests/integration/results-bulk.test.ts e tests/component/results-table-selection.test.tsx con commento covers per AC."

  acceptance_criteria:
    - id: AC-803-1
      given: "progetto P dell'utente con 1.234 candidate nella sezione S1, di cui 300 con review_status 'pending' e keyword contenente 'scarpe', e progetto Q dello stesso utente con 50 righe 'pending' contenenti 'scarpe'"
      when: "l'utente invia PATCH /api/projects/P/results con { action: 'approve', filters: { reviewStatus: 'pending', searchText: 'scarpe' }, subprojectId: S1 }"
      then: "risposta 200 con updated = 300; P ha 300 righe passate a 'approved' e le altre 934 righe invariate; le 50 righe di Q restano 'pending'"
    - id: AC-803-2
      given: "un utente autenticato proprietario del progetto P"
      when: "invia PATCH con ids di 1.001 elementi, con ids [123, null], con action 'delete', e con un body privo sia di ids sia di filters"
      then: "ognuna delle 4 richieste riceve 400 e il numero di righe con review_status 'approved' nel progetto resta invariato"
    - id: AC-803-3
      given: "ResultsTable con 3 righe in pagina, filteredCount 1234 e fetch mockata"
      when: "l'utente clicca «Seleziona tutto», poi «Seleziona tutte le 1234 keyword filtrate», poi il pulsante di applicazione"
      then: "dopo il primo click il pulsante mostra «Applica a 3 selezionate»; dopo il secondo mostra il conteggio 1234; il body della PATCH inviata contiene filters e non contiene ids"
    - id: AC-803-4
      given: "ResultsTable con 3 righe tutte selezionate"
      when: "il componente viene ri-renderizzato con 3 righe diverse (cambio pagina)"
      then: "il pulsante mostra «Applica a 0 selezionate» ed è disabilitato e nessuna checkbox di riga è spuntata"

  target_tests:
    - file: "tests/integration/results-bulk.test.ts"
      covers: [AC-803-1, AC-803-2]
    - file: "tests/component/results-table-selection.test.tsx"
      covers: [AC-803-3, AC-803-4]

  security_notes:
    - "A01 Broken Access Control, CWE-639: l'updateMany per filtri parte sempre da project_id del progetto posseduto (e subproject_id verificato come sezione di quel progetto); i filtri passano da parseResultsFilters che accetta solo valori enum noti."
    - "A06 Insecure Design, CWE-770: tetto di 1000 id per richiesta e validazione dei tipi; action in whitelist di 5 valori (nessun campo arbitrario scrivibile, CWE-915)."

  out_of_scope:
    - "Annullamento delle azioni massive: non previsto dal piano."
    - "Permessi per ruolo nel workspace (MEMBER può approvare ed esportare, D-08): T-1502."

- id: T-804
  title: "CSV pronto per Excel italiano e protetto dalle formule"
  macrotask: "results-export"
  depends_on: [T-406]

  objective: >
    rowsToCsv in lib/modules/export.ts produce CSV senza BOM, con separatore ',' e decimali con il
    punto: Excel in italiano mostra tutto in una colonna e legge '1.5' come data. Le celle che
    iniziano con = + - @, tabulazione o ritorno a capo non sono neutralizzate (una keyword che arriva
    da Google autocomplete può diventare una formula all'apertura del file). Con 0 righe il file è
    vuoto, senza intestazione.

  definition_of_done:
    - "lib/modules/export.ts: serializeCsv(rows, { dialect }) con dialect 'excel-it' (predefinito: BOM UTF-8, separatore ';', decimali con virgola, righe terminate da CRLF) oppure 'rfc4180' (nessun BOM, separatore ',', decimali con punto, CRLF); tutti i campi tra doppi apici con raddoppio degli apici interni come oggi."
    - "Neutralizzazione delle formule: ogni valore testuale che inizia con '=', '+', '-', '@', tabulazione (U+0009) o ritorno a capo (U+000D) viene prefissato con un apostrofo; valori numerici e booleani non vengono prefissati."
    - "Con 0 righe il file contiene BOM (solo excel-it) e la sola riga di intestazione con le colonne di ExportRow."
    - "app/api/projects/[id]/export/route.ts accetta il parametro opzionale csvDialect (excel-it o rfc4180, altro -> 400); il link CSV della pagina risultati usa il predefinito."
    - "tests/unit/csv-export.test.ts con commento covers per AC; la caratterizzazione T-107 è aggiornata con gate umano."

  acceptance_criteria:
    - id: AC-804-1
      given: "2 righe di export e dialect 'excel-it'"
      when: "si chiama serializeCsv"
      then: "i primi 3 byte del buffer sono EF BB BF; il testo contiene 3 righe separate da CRLF; la riga di intestazione divisa per ';' ha tante colonne quante sono le chiavi di ExportRow"
    - id: AC-804-2
      given: "righe con keyword '=1+1', '+39 333 1234567', '-sconto', '@SUM(A1)', tabulazione seguita da 'x', ritorno a capo seguito da 'y' e 'scarpe running'"
      when: "si chiama serializeCsv con dialect 'excel-it'"
      then: "le prime 6 celle keyword iniziano con un apostrofo seguito dal valore originale (per esempio «'=1+1»); la cella 'scarpe running' è invariata; una riga con avg_monthly_searches 1200 riporta 1200 senza apostrofo"
    - id: AC-804-3
      given: "una riga con competition 0.35 e score 51.25"
      when: "si chiama serializeCsv con dialect 'excel-it' e poi con 'rfc4180'"
      then: "con excel-it le celle valgono 0,35 e 51,25; con rfc4180 valgono 0.35 e 51.25, il separatore è ',' e il buffer non inizia con EF BB BF"
    - id: AC-804-4
      given: "0 righe"
      when: "si chiama serializeCsv con dialect 'excel-it'"
      then: "il buffer è BOM + una sola riga di intestazione terminata da CRLF (lunghezza maggiore di 3 byte, 1 riga dopo lo split)"

  target_tests:
    - file: "tests/unit/csv-export.test.ts"
      covers: [AC-804-1, AC-804-2, AC-804-3, AC-804-4]

  security_notes:
    - "A05 Injection, CWE-1236 (Improper Neutralization of Formula Elements in a CSV File): keyword e source_query arrivano da una fonte esterna (Google autocomplete) e da input utente (seed); ogni cella testuale che inizia con un carattere attivo per i fogli di calcolo è prefissata con apostrofo prima della scrittura."

  out_of_scope:
    - "XLSX e Google Sheets: exceljs scrive le stringhe come testo e Sheets usa valueInputOption RAW, quindi nessuna neutralizzazione necessaria; streaming: T-805."

- id: T-805
  title: "Export in streaming per set grandi"
  macrotask: "results-export"
  depends_on: [T-804]

  objective: >
    app/api/projects/[id]/export/route.ts costruisce l'intero file in memoria e lo restituisce come
    buffer: oltre il limite di 4,5 MB delle risposte non in streaming di Vercel (circa 12-15 mila
    righe) l'export fallisce, e lib/modules/export.ts tiene in memoria 3-4 copie dei dati (righe
    Prisma, righe serializzate, stringa, buffer). Inoltre un errore di markOnboardingExportCompleted
    fa fallire un export già generato.

  definition_of_done:
    - "lib/modules/export.ts: iterateExportRows(where, batchSize = 1000) generatore asincrono che legge a blocchi con paginazione a cursore (cursor su id, skip 1) nell'ordine RESULTS_ORDER_BY; streamExport(params) restituisce ReadableStream<Uint8Array> per csv (serializeCsv riga per riga), json (array scritto a pezzi) e xlsx (exceljs stream.xlsx.WorkbookWriter su uno stream di passaggio, commit di ogni riga)."
    - "La route verifica autenticazione, progetto e sezione PRIMA di creare lo stream e risponde new Response(stream) con Content-Type, Content-Disposition e Cache-Control no-store, senza Content-Length."
    - "markOnboardingExportCompleted è chiamato in try/catch: un suo errore produce console.error e non cambia status né contenuto della risposta."
    - "Un errore del DB a metà stream chiude lo stream con errore (controller.error) e viene loggato; nessuna risposta JSON viene mescolata al file."
    - "tests/integration/export-streaming.test.ts con 30.000 righe generate nel DB di test e commento covers per AC."

  acceptance_criteria:
    - id: AC-805-1
      given: "un progetto con 30.000 candidate e uno spy su prisma.keywordCandidate.findMany"
      when: "il proprietario chiama GET /api/projects/[id]/export?format=csv&scope=filtered"
      then: "status 200, header content-length assente, response.body è un ReadableStream; il testo decodificato ha 30.001 righe (intestazione + 30.000) e ogni chiamata a findMany ha take minore o uguale a 1000"
    - id: AC-805-2
      given: "lo stesso progetto con 30.000 candidate"
      when: "si richiedono format=xlsx e format=json"
      then: "il file xlsx letto con exceljs ha il foglio 'keywords' con 30.001 righe; il json analizzato con JSON.parse è un array di 30.000 elementi il cui primo elemento è la prima riga secondo RESULTS_ORDER_BY"
    - id: AC-805-3
      given: "lo stesso progetto e lo spy su findMany"
      when: "il test legge solo il primo chunk del body CSV"
      then: "al momento della ricezione del primo chunk findMany è stato chiamato al massimo 2 volte (nessuna lettura completa prima dell'invio)"
    - id: AC-805-4
      given: "markOnboardingExportCompleted mockato per lanciare un errore, e un secondo utente B senza accesso al progetto"
      when: "il proprietario esporta in CSV e poi B chiama la stessa URL"
      then: "il proprietario riceve 200 con 30.001 righe e console.error viene chiamato 1 volta; B riceve 404 JSON e findMany non viene chiamato per la sua richiesta"

  target_tests:
    - file: "tests/integration/export-streaming.test.ts"
      covers: [AC-805-1, AC-805-2, AC-805-3, AC-805-4]

  security_notes:
    - "A06 Insecure Design, CWE-400 (Uncontrolled Resource Consumption): memoria per richiesta limitata a un blocco di 1000 righe invece dell'intero set; maxDuration della route invariato (120 s)."
    - "A01 Broken Access Control, CWE-862 (Missing Authorization): i controlli di proprietà su progetto e sezione avvengono prima dell'apertura dello stream, così nessun byte di dati parte verso un utente non autorizzato."
    - "A10 Mishandling of Exceptional Conditions, CWE-755: errore a metà stream chiude la risposta in errore invece di consegnare un file troncato con status 200 apparentemente completo; dettaglio dell'errore solo nei log."

  out_of_scope:
    - "Export Google Sheets a blocchi: T-806. Precondizioni dell'onboarding sull'export (export vuoto o di altro progetto): T-1003."

- id: T-806
  title: "Export Google Sheets robusto"
  macrotask: "results-export"
  depends_on: [T-805]

  objective: >
    lib/modules/google-sheets-export.ts scrive tutte le righe in un'unica chiamata values:batchUpdate
    (con set grandi Google risponde 400 per dimensione del payload), lascia sul Drive dell'utente un
    file vuoto se la scrittura fallisce dopo la creazione, deduplica i nomi dei fogli distinguendo
    maiuscole e minuscole (Google rifiuta 'Generale' e 'generale' nello stesso file) e ordina i fogli
    per nome invece che per posizione della sezione; la route restituisce error.message di eccezioni
    interne.

  definition_of_done:
    - "Scrittura a blocchi: per ogni sezione le righe sono lette con iterateExportRows (T-805) e scritte in richieste da massimo 5.000 righe di dati ciascuna; l'intestazione solo nella prima richiesta del foglio; ogni fetch verso Google ha AbortSignal.timeout(30000)."
    - "Pulizia del file incompleto: se una scrittura fallisce dopo la creazione si chiama DELETE https://www.googleapis.com/drive/v3/files/<id>; se Google risponde 403 o 404 (scope attuale spreadsheets, vedi T-907) il file viene rinominato con prefisso «[INCOMPLETO] » via spreadsheets.batchUpdate e l'URL viene restituito nell'errore."
    - "uniqueSheetTitles confronta i titoli senza distinzione di maiuscole/minuscole; buildGroupedSheets ordina i fogli per position della sezione e poi per nome."
    - "app/api/projects/[id]/export/google-sheets/route.ts: GoogleSheetsExportError -> suo status e messaggio; ogni altro errore -> 500 con messaggio generico «Errore interno durante l'export su Google Sheets» e console.error con lo stack."
    - "tests/integration/sheets-export.test.ts con Google mockato (fetch mock o msw) e commento covers per AC."

  acceptance_criteria:
    - id: AC-806-1
      given: "una sezione con 12.000 righe da esportare e le API Google mockate con successo"
      when: "il proprietario chiama POST /api/projects/[id]/export/google-sheets"
      then: "il mock riceve 3 richieste di scrittura valori con 5.000, 5.000 e 2.000 righe di dati, la prima con la riga di intestazione in più; la risposta 200 ha data.exportedRows = 12000"
    - id: AC-806-2
      given: "la seconda richiesta di scrittura mockata con risposta 500"
      when: "si esegue l'export con DELETE su Drive che risponde 204, poi di nuovo con DELETE che risponde 403"
      then: "nel primo caso il mock riceve 1 DELETE sull'id del file e la route risponde 502 senza spreadsheetUrl; nel secondo caso il mock riceve una batchUpdate con titolo che inizia con «[INCOMPLETO] » e la risposta 502 contiene lo spreadsheetUrl del file"
    - id: AC-806-3
      given: "sezioni 'Zeta' (posizione 0), 'Generale' (posizione 1) e 'generale' (posizione 2), tutte con righe da esportare"
      when: "si esegue l'export dell'intero progetto"
      then: "la richiesta di creazione del file contiene i fogli nell'ordine 'Zeta', 'Generale', 'generale (2)'"
    - id: AC-806-4
      given: "exportProjectToGoogleSheets mockato per lanciare TypeError('cannot read secret_field')"
      when: "il proprietario chiama la route di export Google Sheets"
      then: "risposta 500 con error uguale a «Errore interno durante l'export su Google Sheets», il body non contiene 'secret_field' e console.error viene chiamato 1 volta"

  target_tests:
    - file: "tests/integration/sheets-export.test.ts"
      covers: [AC-806-1, AC-806-2, AC-806-3, AC-806-4]

  security_notes:
    - "A10 Mishandling of Exceptional Conditions, CWE-209 (Generation of Error Message Containing Sensitive Information): al client arriva solo il messaggio di GoogleSheetsExportError o quello generico; nessun error.message di eccezioni interne."
    - "A09 Security Logging and Alerting Failures, CWE-532 (Insertion of Sensitive Information into Log File): i log degli errori non contengono access token, refresh token né il body delle richieste a Google."
    - "A01 Broken Access Control, CWE-639: progetto e sezione restano verificati per proprietà prima di leggere righe o chiamare Google; il file viene creato solo nel Drive dell'utente che esporta (credenziale personale)."

  out_of_scope:
    - "Gestione di invalid_grant, revoca dei token e scope verificati: T-906. Passaggio allo scope drive.file: T-907."

- id: T-807
  title: "Scope di export coerenti con revisione e filtri"
  macrotask: "results-export"
  depends_on: [T-802]

  objective: >
    In buildScopeWhere (lib/modules/export.ts) lo scope 'non-excluded' guarda solo brand_status e
    quindi esporta anche le keyword rifiutate in revisione (review_status 'rejected'); gli scope
    diversi da 'filtered' ignorano in silenzio i filtri della pagina, così «CSV solo approvate»
    aperto da una vista filtrata esporta tutte le approvate del perimetro. Il task rende ogni scope
    l'intersezione tra regola di revisione e vista corrente (sezione + filtri) e lo dichiara in pagina.

  definition_of_done:
    - "lib/modules/export.ts: buildExportWhere(projectId, scope, filters, subprojectId) esportata e unica fonte del where per tutti i lettori di righe di export (getExportRows o iterateExportRows di T-805, quindi export file e Google Sheets); ogni scope è combinato in AND con buildResultsWhere(projectId, filters, subprojectId)."
    - "Regole: approved = review_status approved e brand_status diverso da excluded; selected = selected_for_export true e review_status diverso da rejected; review = review_status pending; non-excluded = brand_status diverso da excluded e review_status diverso da rejected; filtered = solo i filtri."
    - "app/projects/[id]/results/page.tsx mostra sopra i pulsanti di export il testo «Gli export usano la sezione e i filtri della vista corrente» e le etichette dei pulsanti restano quelle di oggi."
    - "tests/unit/export-scope.test.ts e tests/integration/export-scope.test.ts con commento covers per AC; la caratterizzazione T-107 è aggiornata con gate umano."

  acceptance_criteria:
    - id: AC-807-1
      given: "scope 'non-excluded', filtri vuoti e subprojectId null"
      when: "si chiama buildExportWhere('P', ...)"
      then: "l'oggetto where contiene in AND { project_id: 'P' }, { brand_status: { not: 'excluded' } } e { review_status: { not: 'rejected' } }"
    - id: AC-807-2
      given: "scope 'approved', filtri { searchText: 'scarpe' } e subprojectId 'S1'"
      when: "si chiama buildExportWhere('P', ...)"
      then: "il where contiene in AND project_id 'P', subproject_id 'S1', review_status 'approved', brand_status non 'excluded' e la clausola OR su keyword e normalized_keyword con contains 'scarpe' in modalità insensitive"
    - id: AC-807-3
      given: "una sezione con 7 righe: r1 approved/allowed/selezionata 'scarpe running', r2 approved/allowed/selezionata 'borsa pelle', r3 approved/excluded/non selezionata 'scarpe nike', r4 pending/allowed/selezionata 'scarpe trail', r5 pending/review/selezionata 'borsa gucci', r6 rejected/allowed/selezionata 'scarpe usate', r7 rejected/allowed/non selezionata 'borsa usata'"
      when: "il proprietario chiama GET /api/projects/[id]/export?format=json con gli scope e i filtri indicati e la sezione come subprojectId"
      then: "l'array JSON di non-excluded senza filtri ha 4 righe (r1, r2, r4, r5); approved con searchText scarpe 1 riga (r1); selected con searchText scarpe 2 righe (r1, r4); review senza filtri 2 righe (r4, r5); filtered con searchText scarpe 4 righe (r1, r3, r4, r6)"
    - id: AC-807-4
      given: "la stessa sezione e le API Google mockate"
      when: "si esporta con scope 'non-excluded' in CSV tramite la route di export e su Google Sheets"
      then: "il CSV ha 5 righe (intestazione + 4) e la risposta Google Sheets ha data.exportedRows = 4"

  target_tests:
    - file: "tests/unit/export-scope.test.ts"
      covers: [AC-807-1, AC-807-2]
    - file: "tests/integration/export-scope.test.ts"
      covers: [AC-807-3, AC-807-4]

  security_notes:
    - "A01 Broken Access Control, CWE-639: buildExportWhere inizia sempre con project_id del progetto verificato e aggiunge subproject_id solo dopo la verifica di appartenenza fatta dalla route; i filtri arrivano da parseResultsFilters (enum in whitelist, testo usato solo in contains parametrizzato)."
    - "A01 Broken Access Control, CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor): un export non può includere righe fuori dalla vista corrente (sezione e filtri) né righe rifiutate, così un link condiviso o un export automatico non divulga keyword che l'utente ha escluso."

  out_of_scope:
    - "Nuove etichette o nuovi scope di export: invariati, cambia solo la semantica documentata qui."

- id: T-808
  title: "Sezioni: nomi duplicati, riordino, ultima sezione"
  macrotask: "results-export"
  depends_on: [T-105]

  objective: >
    Il vincolo @@unique([project_id, name]) di Subproject fa fallire con P2002 la creazione o la
    rinomina con un nome già usato e le route rispondono 500 generico. components/subproject-form.tsx
    in modalità create non svuota il form dopo il salvataggio; components/section-order-buttons.tsx
    mostra '?' al posto delle frecce (encoding) e non ha aria-label; il riordino riscrive le position
    di tutte le sezioni in una transazione interattiva; il blocco «non puoi eliminare l'ultima sezione»
    conta le sezioni fuori dalla transazione, quindi due DELETE concorrenti possono lasciare il
    progetto senza sezioni.

  definition_of_done:
    - "POST app/api/projects/[id]/subprojects e PATCH app/api/projects/[id]/subprojects/[subprojectId]: P2002 sul nome -> 409 { error: «Esiste già una sezione con questo nome», code: 'SECTION_NAME_TAKEN' }."
    - "PATCH app/api/projects/[id]/subprojects/reorder: scambia la position della sezione con quella adiacente con 2 update nella stessa transazione; se le position non sono 0..n-1 univoche vengono prima normalizzate nella stessa transazione; gli update hanno where con id e project_id."
    - "DELETE app/api/projects/[id]/subprojects/[subprojectId]: conteggio, eliminazione e rinumerazione nella stessa transazione, con lock della riga del progetto (SELECT ... FOR UPDATE via Prisma.sql parametrizzato); la delete usa where con id e project_id."
    - "components/section-order-buttons.tsx riceve subprojectName e mostra '↑' e '↓' con aria-label «Sposta in alto la sezione <nome>» e «Sposta in basso la sezione <nome>»; components/subproject-form.tsx in modalità create senza redirectTo riporta i valori ai default dopo una risposta 201."
    - "tests/integration/sections.test.ts, tests/component/section-order-buttons.test.tsx e tests/component/subproject-form.test.tsx con commento covers per AC."

  acceptance_criteria:
    - id: AC-808-1
      given: "un progetto con le sezioni 'Generale' e 'Blog'"
      when: "il proprietario invia POST di una sezione 'Generale' e PATCH che rinomina 'Blog' in 'Generale'"
      then: "entrambe le richieste ricevono 409 con code 'SECTION_NAME_TAKEN' e il progetto ha ancora esattamente 2 sezioni con nomi 'Generale' e 'Blog'"
    - id: AC-808-2
      given: "un progetto con 5 sezioni S1..S5 in posizione 0..4 e uno spy su tx.subproject.update"
      when: "il proprietario invia PATCH reorder con { subprojectId: S3, direction: 'up' }"
      then: "risposta 200; l'ordine per position è S1, S3, S2, S4, S5 con position 0..4 univoche; update è stato chiamato 2 volte"
    - id: AC-808-3
      given: "un progetto con esattamente 2 sezioni S1 e S2"
      when: "il proprietario invia in parallelo DELETE di S1 e DELETE di S2"
      then: "una richiesta riceve 200 e l'altra 400 con il messaggio sull'ultima sezione; nel DB resta esattamente 1 sezione del progetto"
    - id: AC-808-4
      given: "SectionOrderButtons per la sezione 'Blog' e SubprojectForm in modalità create con fetch mockata che risponde 201"
      when: "si renderizzano i componenti e si invia il form con nome 'Nuova sezione'"
      then: "esistono pulsanti con nome accessibile «Sposta in alto la sezione Blog» e «Sposta in basso la sezione Blog» e testo '↑' e '↓' (nessun '?'); dopo l'invio il campo nome del form vale stringa vuota"

  target_tests:
    - file: "tests/integration/sections.test.ts"
      covers: [AC-808-1, AC-808-2, AC-808-3]
    - file: "tests/component/section-order-buttons.test.tsx"
      covers: [AC-808-4]
    - file: "tests/component/subproject-form.test.tsx"
      covers: [AC-808-4]

  security_notes:
    - "A01 Broken Access Control, CWE-639: update e delete delle sezioni usano where con id e project_id del progetto verificato (oggi solo id dopo il controllo: finestra check-then-act); la matrice per workspace resta a T-1502."
    - "A06 Insecure Design, CWE-362 (Race Condition): l'invariante 'almeno una sezione' è garantita dal lock della riga del progetto dentro la transazione, non da un conteggio letto prima."
    - "A10 Mishandling of Exceptional Conditions, CWE-209: P2002 mappato a 409 con codice stabile, senza nome del vincolo né messaggio Prisma nel body."

  out_of_scope:
    - "Progetti con 0 sezioni creati dall'onboarding (createInitialSection false): creazione atomica di progetto e sezione in T-1001."
    - "Unicità dei nomi senza distinzione di maiuscole/minuscole: non prevista; i fogli Google gestiscono il caso in T-806."

- id: T-809
  title: "Aggiornamenti parziali e validazione degli input di progetti e sezioni"
  macrotask: "results-export"
  depends_on: [T-503]

  objective: >
    lib/modules/project-settings.ts e le route PATCH si comportano come PUT con default distruttivi:
    un body parziale riporta name a «Progetto senza nome», min_volume a 0 e i flag ai default; una
    PATCH di sezione senza il campo seeds cancella tutte le seed. Le seed oltre 500 sono troncate in
    silenzio, min_volume non ha massimo (oltre 2^31 la colonna Int fa fallire la query con 500),
    parseOptionalBoolean restituisce Boolean('n') = true, lingua o paese override non validi
    diventano 'en'/'US' invece di un errore, non ci sono limiti di lunghezza e il provider di metriche
    MOCK è selezionabile da qualunque utente.

  definition_of_done:
    - "lib/modules/project-settings.ts: schemi zod strict projectCreateSchema, projectPatchSchema (tutti i campi opzionali), subprojectCreateSchema, subprojectPatchSchema; i campi assenti non compaiono nel data dell'update Prisma; '' o null su un campo override significa eredita (null)."
    - "Limiti: name 1-120 caratteri, description massimo 1000, ogni seed massimo 200 caratteri, massimo 500 seed per richiesta (oltre -> 400, mai troncamento), min_volume intero 0-2147483647, booleani solo true/false/1/0/yes/no/on/off (inherit per gli override), language_code e country_code solo valori di lib/constants/locale-options.ts, scoring_profile solo balanced/conservative/aggressive."
    - "metrics_provider 'MOCK' (e override) accettato solo per il root admin: per gli altri utenti 403 con code 'FORBIDDEN_FIELD'; autocomplete_provider mantiene la regola attuale."
    - "Le route POST/PATCH di app/api/projects/route.ts, app/api/projects/[id]/route.ts, app/api/projects/[id]/subprojects/route.ts e [subprojectId]/route.ts usano gli schemi e restituiscono gli errori nel formato di T-503 (400 con code 'VALIDATION_ERROR' e nome del campo)."
    - "tests/integration/project-settings-validation.test.ts con commento covers per AC."

  acceptance_criteria:
    - id: AC-809-1
      given: "un progetto con min_volume 500, exclude_brands false, expand_alpha false e una sezione con 12 seed"
      when: "il proprietario invia PATCH progetto { name: 'Nuovo nome' }, PATCH sezione { description: 'note' } e poi PATCH sezione { seeds: '' }"
      then: "dopo la prima il progetto ha name 'Nuovo nome', min_volume 500, exclude_brands false, expand_alpha false; dopo la seconda la sezione ha ancora 12 seed; dopo la terza ha 0 seed"
    - id: AC-809-2
      given: "un utente proprietario non root admin"
      when: "invia separatamente min_volume 2147483648, exclude_brands 'n', language_code_override 'xx', un name di 121 caratteri, 501 seed e scoring_profile 'turbo'"
      then: "ogni richiesta riceve 400 con code 'VALIDATION_ERROR' e il campo coinvolto nella risposta; il progetto e la sezione nel DB restano invariati (stessi valori e stesso numero di seed)"
    - id: AC-809-3
      given: "un utente non root admin e il root admin, ciascuno proprietario di un progetto"
      when: "entrambi inviano PATCH { metrics_provider: 'MOCK' } al proprio progetto"
      then: "l'utente non root riceve 403 con code 'FORBIDDEN_FIELD' e metrics_provider resta invariato; il root admin riceve 200 e metrics_provider vale 'MOCK'"
    - id: AC-809-4
      given: "un proprietario di progetto"
      when: "invia PATCH progetto con il campo sconosciuto owner_user_id e PATCH sezione con language_code_override ''"
      then: "la prima riceve 400 e owner_user_id nel DB non cambia; la seconda riceve 200 e language_code_override nel DB è null"

  target_tests:
    - file: "tests/integration/project-settings-validation.test.ts"
      covers: [AC-809-1, AC-809-2, AC-809-3, AC-809-4]

  security_notes:
    - "A08 Software or Data Integrity Failures, CWE-915 (Improperly Controlled Modification of Dynamically-Determined Object Attributes): schemi strict, i campi non dichiarati (owner_user_id, default_subproject_id, id) sono rifiutati con 400 e mai passati a Prisma."
    - "A01 Broken Access Control, CWE-284 (Improper Access Control): il provider di metriche MOCK, che produce volumi finti, è riservato al root admin lato server; il client non decide."
    - "A10 Mishandling of Exceptional Conditions, CWE-190 (Integer Overflow) e CWE-20 (Improper Input Validation): valori fuori range rifiutati con 400 prima della query, nessun 500 da overflow della colonna Int."

  out_of_scope:
    - "Limiti di seed per piano (maxSeedsPerSection, D-14): T-1605. Endpoint di onboarding: T-1001."

- id: T-810
  title: "Dashboard: tutti i progetti raggiungibili e attività reale"
  macrotask: "results-export"
  depends_on: [T-105]

  objective: >
    app/page.tsx carica i progetti con take 20 senza paginazione mentre il contatore mostra il totale:
    dal ventunesimo in poi i progetti non sono raggiungibili dalla dashboard. Ordinamento e colonna
    «Aggiornato» usano project.updated_at, che non cambia quando si esegue un'estrazione, si crea una
    sezione o si revisionano keyword, quindi il progetto su cui si lavora non sale in cima.

  definition_of_done:
    - "prisma/schema.prisma: colonna projects.last_activity_at DateTime con default now(); migrazione con backfill al valore massimo tra updated_at del progetto, created_at/completed_at dei job e updated_at delle sezioni."
    - "lib/modules/project-activity.ts: touchProjectActivity(tx, projectId) chiamato da job-runner (completamento e fallimento), creazione/modifica/eliminazione/riordino sezioni, PATCH risultati e PATCH progetto."
    - "lib/modules/dashboard.ts: listDashboardProjects(userId, page) con pagine da 20, orderBy [{ last_activity_at: 'desc' }, { id: 'asc' }], restituisce items, total, page, totalPages; page vuota, non numerica o fuori range ricondotta a 1 o all'ultima."
    - "app/page.tsx usa listDashboardProjects con ?page=, mostra «Pagina X di Y» con link precedente/successiva e la colonna «Aggiornato» su last_activity_at."
    - "tests/integration/dashboard-projects.test.ts con commento covers per AC."

  acceptance_criteria:
    - id: AC-810-1
      given: "un utente con 45 progetti"
      when: "si chiama listDashboardProjects con page 1, 2, 3 e 99"
      then: "le pagine 1, 2 e 3 hanno rispettivamente 20, 20 e 5 progetti, tutti distinti; total = 45 e totalPages = 3; page 99 restituisce page = 3 con 5 progetti"
    - id: AC-810-2
      given: "45 progetti in cui P01 ha la last_activity_at più vecchia"
      when: "un job di estrazione su P01 termina con runJobById"
      then: "P01 è il primo elemento di page 1 e la sua last_activity_at è uguale a completed_at del job"
    - id: AC-810-3
      given: "45 progetti con P02 e P03 nella pagina 3"
      when: "il proprietario crea una sezione in P02 e poi invia una PATCH risultati con azione approve su P03"
      then: "page 1 inizia con P03 seguito da P02"
    - id: AC-810-4
      given: "l'utente A con 45 progetti e l'utente B con 7 progetti"
      when: "si chiama listDashboardProjects per A su tutte le pagine"
      then: "total = 45 e nessuno dei 7 id di B compare in alcuna pagina"

  target_tests:
    - file: "tests/integration/dashboard-projects.test.ts"
      covers: [AC-810-1, AC-810-2, AC-810-3, AC-810-4]

  security_notes:
    - "A01 Broken Access Control, CWE-639: listDashboardProjects filtra sempre per owner_user_id dell'utente della sessione (per membership di workspace da T-1502); il parametro page non può allargare il perimetro."
    - "A06 Insecure Design, CWE-770: dimensione di pagina fissa a 20 lato server, non controllabile dal client."

  out_of_scope:
    - "Stato onboarding letto in modo leggero nella dashboard: T-1004. Formattazione condivisa delle date e dei badge di stato: T-1102."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
