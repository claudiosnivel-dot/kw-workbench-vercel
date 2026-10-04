# 07-extraction-fixes — Macrotask `extraction-fixes`

> Correttezza della pipeline di estrazione (espansione, normalizzazione, filtro brand, classificazione, re-run, job, punteggio): nasce dai rilievi «pipeline» dell'audit 2026-10-02 su `lib/modules/**` e `lib/modules/pipeline/extraction.ts`.

## Obiettivo del macrotask

Rendere l'output dell'estrazione fedele all'intento dell'utente: ogni seed riceve una quota equa del budget di query, keyword diverse non collassano più sulla stessa forma canonica (e keyword uguali sì, anche fuori dall'alfabeto latino), il filtro brand e la classificazione lavorano per parola intera e per lingua, un nuovo run non cancella il lavoro di revisione, i job falliscono in modo esplicito senza esporre dettagli interni e il punteggio dichiara da quale sorgente nasce.
Tutti i task partono dal golden master della pipeline (T-106): ogni variazione dello snapshot è attesa, elencata nel task e approvata da un umano prima del merge (D-01).
Strato: tutto il codice di dominio resta in `lib/modules/**` e non importa da `components/**` o `app/**` (D-22).

## Task atomici

```yaml
- id: T-701
  title: "Budget di query equo tra tutte le seed"
  macrotask: "extraction-fixes"
  depends_on: [T-106]

  objective: >
    Oggi buildExpansionQueries (lib/modules/expansion-engine.ts) genera le query seed per seed
    (circa 45 per seed: base + 8 pattern globali + 26 lettere + 10 cifre) e extraction.ts tronca
    con slice(0, 250): con 10 seed vengono espanse solo le prime 5 e mezza, e l'ordine delle seed
    non è nemmeno deterministico (include seeds senza orderBy). Il task ripartisce il budget a
    livelli di priorità con giro round-robin tra le seed e dichiara il troncamento nel risultato del job.

  definition_of_done:
    - "lib/modules/expansion-engine.ts: buildExpansionQueries riceve il parametro limit e restituisce { queries, truncated, skippedQueries } invece di string[]; la funzione resta pura (nessun accesso a env o DB)."
    - "Ordine di generazione a livelli: (1) la base di tutte le seed nell'ordine ricevuto, (2) i pattern, (3) le espansioni alfabetiche a..z, (4) le numeriche 0..9; dentro ogni livello giro round-robin (variante 1 per tutte le seed, poi variante 2 per tutte le seed, ...). Duplicati rimossi conservando la prima occorrenza."
    - "lib/modules/pipeline/extraction.ts: la query Prisma della sezione usa seeds con orderBy [{ created_at: 'asc' }, { id: 'asc' }]; il limite (oggi MAX_EXPANSION_QUERIES, minimo 50) è passato a buildExpansionQueries invece dello slice."
    - "ExtractionSummary (salvato in jobs.result) contiene anche truncated (boolean) e skippedQueries (numero di query uniche generate e non eseguite)."
    - "tests/unit/expansion-engine.test.ts copre gli AC con un commento covers per AC; lo snapshot del golden master T-106 è aggiornato solo nell'ordine delle query/sorgenti, con diff approvato da un umano."

  acceptance_criteria:
    - id: AC-701-1
      given: "10 seed (s01..s10), espansioni alfabetiche, numeriche e pattern attive, gli 8 pattern globali di prisma/seed.ts e limit = 250"
      when: "si chiama buildExpansionQueries"
      then: "queries.length = 250; le prime 10 query sono le 10 seed nell'ordine ricevuto; ognuna delle 10 seed compare in esattamente 25 query (1 base + 8 pattern + 16 lettere da 'a' a 'p'); truncated = true e skippedQueries = 200"
    - id: AC-701-2
      given: "3 seed, tutte le espansioni attive, gli 8 pattern globali e limit = 250"
      when: "si chiama buildExpansionQueries"
      then: "queries.length = 135; indici 0-2 = le 3 basi, 3-26 = 24 query da pattern, 27-104 = 78 query alfabetiche, 105-134 = 30 query numeriche; truncated = false e skippedQueries = 0"
    - id: AC-701-3
      given: "seed ['alfa', 'beta'], solo espansione alfabetica attiva, limit = 250"
      when: "si chiama buildExpansionQueries"
      then: "le query dalla posizione 2 alla 5 sono nell'ordine 'alfa a', 'beta a', 'alfa b', 'beta b' (giro round-robin dentro il livello alfabetico)"
    - id: AC-701-4
      given: "300 seed distinte, tutte le espansioni attive, gli 8 pattern globali e limit = 250"
      when: "si chiama buildExpansionQueries"
      then: "queries contiene esattamente le prime 250 seed come basi e nessuna espansione; truncated = true e skippedQueries = 13250 (300 x 45 - 250)"

  target_tests:
    - file: "tests/unit/expansion-engine.test.ts"
      covers: [AC-701-1, AC-701-2, AC-701-3, AC-701-4]

  security_notes:
    - "A06 Insecure Design, CWE-770 (Allocation of Resources Without Limits): il tetto di query per job resta l'unico limite delle chiamate in uscita verso Google; il task non lo alza e il valore arriva come parametro (letto da env validata dopo T-201), mai calcolato dentro la funzione pura."

  out_of_scope:
    - "Validazione di MAX_EXPANSION_QUERIES e AUTOCOMPLETE_CONCURRENCY (NaN, stringa vuota): T-201."
    - "Esecuzione a passi con budget di tempo e ripresa: T-1202. Visualizzazione delle query troncate nella barra di avanzamento: T-1205."

- id: T-702
  title: "Normalizzazione multilingua corretta"
  macrotask: "extraction-fixes"
  depends_on: [T-106]

  objective: >
    lib/modules/normalization.ts oggi rimuove gli apostrofi senza spazio («l'hotel» diventa «lhotel»),
    trasforma ogni simbolo in spazio (c++, c-sharp e c collassano su «c tutorial»; «node.js» diventa
    «node js»), applica NFKD e toglie tutti i segni combinanti (distrugge devanagari e thai, toglie il
    dakuten giapponese) e rimuove the/a/an in ogni lingua prima del lowercase («vitamin a» diventa
    «vitamin», «The» maiuscolo resta). Il task riscrive normalizeKeyword e canonicalizeKeyword con
    regole esplicite e dipendenti dalla lingua del progetto.

  definition_of_done:
    - "lib/modules/normalization.ts: firma canonicalizeKeyword(input: string, languageCode: string); normalizeKeyword(input) resta senza lingua; le regole sono documentate in un commento di testa con la tabella esempio-risultato degli AC."
    - "Regole: NFC e lowercase come primo passo; apostrofo (U+0027, U+2018, U+2019) seguito da 's' a fine parola rimosso senza spazio (possessivo inglese), ogni altro apostrofo diventa spazio; '+' e il carattere cancelletto (U+0023) restano se attaccati in coda a lettere o cifre (c++, f-sharp scritto con il simbolo), '.' resta se tra due caratteri alfanumerici, '-' resta come oggi; ogni altro simbolo diventa spazio; spazi compattati."
    - "Solo canonicalizeKeyword: i segni combinanti sono rimossi SOLO se la lettera base è latina, greca o cirillica (scritture Script=Latin/Greek/Cyrillic); nessun segno rimosso per le altre scritture; nessuna normalizzazione NFKD che cambi i caratteri giapponesi; rimozione dell'articolo SOLO per languageCode 'en' e SOLO per 'the' iniziale, dopo il lowercase; 'a' e 'an' mai rimossi."
    - "lib/modules/dedupe.ts: dedupeCandidates(input, languageCode); lib/modules/pipeline/extraction.ts passa effective.language_code."
    - "Golden master T-106 aggiornato: il diff dello snapshot elenca solo righe con apostrofi, simboli, articoli o scritture non latine, ed è approvato da un umano (gate) prima del merge."

  acceptance_criteria:
    - id: AC-702-1
      given: "le keyword «l'hotel roma», «l’hotel roma» (apostrofo tipografico U+2019), «lhotel roma» con lingua 'it' e «women's shoes» con lingua 'en'"
      when: "si chiamano canonicalizeKeyword e normalizeKeyword"
      then: "le prime due danno 'l hotel roma', la terza dà 'lhotel roma' (forma distinta), «women's shoes» dà 'womens shoes'; normalizeKeyword(«Caffè Latte») = 'caffè latte' (accenti conservati nella forma normalizzata)"
    - id: AC-702-2
      given: "le keyword 'c++ tutorial', la stessa con 'c' seguito dal carattere cancelletto U+0023 al posto di 'c++', 'c tutorial', 'node.js tutorial', 'node js tutorial' e 'a/b test' con lingua 'en'"
      when: "si chiama canonicalizeKeyword su ciascuna"
      then: "le prime tre producono 3 forme canoniche diverse ('c++ tutorial', la forma con il simbolo cancelletto conservato, 'c tutorial'); 'node.js tutorial' resta 'node.js tutorial' ed è diversa da 'node js tutorial'; 'a/b test' dà 'a b test'"
    - id: AC-702-3
      given: "le keyword 'caffè' e 'caffe' (lingua 'it'), 'Ñandú' (lingua 'es'), 'हिन्दी समाचार' (lingua 'hi'), 'สวัสดี' (lingua 'th'), 'ガジェット' e 'カジェット' (lingua 'ja')"
      when: "si chiama canonicalizeKeyword su ciascuna"
      then: "'caffè' e 'caffe' danno entrambe 'caffe'; 'Ñandú' dà 'nandu'; 'हिन्दी समाचार' e 'สวัสดี' restano identiche all'input in NFC (stessa sequenza di code point); 'ガジェット' e 'カジェット' restano due forme diverse (dakuten conservato)"
    - id: AC-702-4
      given: "le keyword 'The best pizza', 'the best pizza', 'vitamin a' e 'an apple a day' con lingua 'en', e 'the best pizza' con lingua 'it'"
      when: "si chiama canonicalizeKeyword"
      then: "'The best pizza' e 'the best pizza' (en) danno entrambe 'best pizza'; 'vitamin a' resta 'vitamin a'; 'an apple a day' resta 'an apple a day'; 'the best pizza' con lingua 'it' resta 'the best pizza'"

  target_tests:
    - file: "tests/unit/normalization.test.ts"
      covers: [AC-702-1, AC-702-2, AC-702-3, AC-702-4]

  security_notes:
    - "A06 Insecure Design, CWE-176 (Improper Handling of Unicode Encoding): dedupe, filtro brand (T-703) e match metriche usano la stessa forma canonica calcolata da NFC, così varianti Unicode equivalenti (apostrofo ASCII e U+2019, lettere accentate composte e decomposte) non eludono il filtro brand né generano duplicati."
    - "Nessun segreto o dato di autenticazione toccato; l'output finisce solo in query Prisma parametrizzate."

  out_of_scope:
    - "Filtro brand sulla forma canonica: T-703. Classificazione per lingua: T-704. Pulizia del punteggio: T-707."
    - "Match delle metriche Keyword Planner sul canonical (caffe/caffè): T-902. Import CSV dei volumi sul canonical: T-905."
    - "Unificazione di trattino e spazio (e-commerce, e commerce, ecommerce): comportamento invariato, nessuna nuova regola."

- id: T-703
  title: "Filtro brand a parola intera"
  macrotask: "extraction-fixes"
  depends_on: [T-702]

  objective: >
    evaluateBrandStatus (lib/modules/brand-filter.ts) usa includes(' token ') || includes(token):
    la seconda condizione rende inutile la prima, quindi 'hp' esclude 'php tutorial' e 'apple'
    esclude 'pineapple juice'; inoltre confronta la keyword grezza, così 'nestlé' non trova 'nestle'
    e un apostrofo tipografico elude il brand. Il task confronta sequenze di parole intere sulla
    forma canonica di T-702.

  definition_of_done:
    - "lib/modules/brand-filter.ts: prepareBlacklist(brands, languageCode) converte una volta per run ogni brand in sequenza di token (canonicalizeKeyword, poi split su spazi e trattini); evaluateBrandStatus riceve la blacklist preparata e la lingua e cerca la sequenza come sottosequenza contigua dei token della keyword."
    - "brand_reason invariato nel formato 'Matched blacklist brand: <brand originale>'; brand vuoti o di soli spazi ignorati come oggi."
    - "lib/modules/pipeline/extraction.ts chiama prepareBlacklist una sola volta per job (non per keyword) e non fa più toLowerCase sui brand."
    - "tests/unit/brand-filter.test.ts con commento covers per AC; snapshot T-106 aggiornato solo nelle righe con brand_status cambiato, diff approvato da un umano."

  acceptance_criteria:
    - id: AC-703-1
      given: "blacklist ['hp'], excludeBrands = true, lingua 'it'"
      when: "si valutano 'php tutorial' e 'stampante hp'"
      then: "'php tutorial' ha brand_status 'allowed' e nessun matchedBrand; 'stampante hp' ha brand_status 'excluded' e brand_reason 'Matched blacklist brand: hp'"
    - id: AC-703-2
      given: "blacklist ['apple'], excludeBrands = false, lingua 'en'"
      when: "si valutano 'pineapple juice' e 'apple watch'"
      then: "'pineapple juice' ha brand_status 'allowed'; 'apple watch' ha brand_status 'review' e matchedBrand 'apple'"
    - id: AC-703-3
      given: "blacklist ['nestlé', «l'oréal»], excludeBrands = true, lingua 'it'"
      when: "si valutano 'nestle cereali' e «l’oreal shampoo» (apostrofo U+2019, senza accento)"
      then: "entrambe hanno brand_status 'excluded'; matchedBrand vale rispettivamente 'nestlé' e «l'oréal»"
    - id: AC-703-4
      given: "blacklist ['coca-cola'], excludeBrands = true, lingua 'it'"
      when: "si valutano 'coca cola zero', 'coca-cola zero' e 'cola di pesce'"
      then: "le prime due hanno brand_status 'excluded', 'cola di pesce' ha brand_status 'allowed'"

  target_tests:
    - file: "tests/unit/brand-filter.test.ts"
      covers: [AC-703-1, AC-703-2, AC-703-3, AC-703-4]

  security_notes:
    - "A06 Insecure Design, CWE-697 (Incorrect Comparison): il confronto per sottostringa esclude keyword legittime (falsi positivi) e lascia passare varianti Unicode dei brand (falsi negativi); il confronto avviene solo su forma canonica NFC tokenizzata, la stessa per keyword e blacklist."
    - "Le blacklist di progetto restano lette con where project_id del progetto del job (o globali con project_id null): nessuna blacklist di altri progetti entra nel confronto (A01, CWE-639)."

  out_of_scope:
    - "Elisioni italiane che coincidono con un brand (brand 'dell' e keyword «hotel dell'aquila» producono un match): limite noto, documentato nel commento del modulo, nessuna euristica in questo task."
    - "Gestione della blacklist da UI e deduplicazione dei brand globali: non previste dal piano."

- id: T-704
  title: "Classificazione degli intenti per parola intera e per lingua"
  macrotask: "extraction-fixes"
  depends_on: [T-702]

  objective: >
    classifyKeyword (lib/modules/classification.ts) cerca sottostringhe di sole liste inglesi:
    'in ' rende locale 'login page', 'app' rende navigazionale 'apple iphone price', 'book' rende
    transazionale 'facebook ads guide', 'top' rende commerciale 'laptop', 'kit' rende prodotto
    'kitchen ideas'; le keyword italiane restano tutte 'generic'/'mixed'. Il task introduce liste
    per lingua (almeno it ed en), confronto per parola intera e una classificazione neutra
    dichiarata per le lingue senza liste.

  definition_of_done:
    - "lib/modules/classification.ts: classifyKeyword(keyword, languageCode) tokenizza normalizeKeyword(keyword) (T-702) e confronta parole intere; gli indizi di più parole ('near me', 'vicino a me', 'open now') sono sequenze contigue di token."
    - "Lessici per lingua in un unico oggetto CLASSIFICATION_LEXICONS con chiavi 'it' ed 'en' (domande, locale, tool, commerciale, transazionale, navigazionale, prodotto, servizio, contenuto); l'indizio 'in' è rimosso dalle liste locali."
    - "Export isClassificationSupported(languageCode); per lingue non supportate classifyKeyword restituisce keyword_type 'generic', search_intent 'mixed' (valore neutro già presente nell'enum SearchIntent di prisma/schema.prisma, nessuna migrazione) e i 4 flag a false."
    - "lib/modules/pipeline/extraction.ts passa effective.language_code; app/projects/[id]/results/page.tsx mostra la nota «Classificazione automatica non disponibile per la lingua <codice>» quando la lingua effettiva della vista non è supportata."
    - "tests/unit/classification.test.ts con commento covers per AC; snapshot T-106 aggiornato nelle sole colonne search_intent/keyword_type/flag, diff approvato da un umano."

  acceptance_criteria:
    - id: AC-704-1
      given: "lingua 'en' e le keyword 'login page', 'apple iphone price', 'facebook ads guide', 'laptop', 'kitchen ideas'"
      when: "si chiama classifyKeyword"
      then: "'login page': is_local_intent false e search_intent 'navigational'; 'apple iphone price': search_intent 'commercial'; 'facebook ads guide': search_intent diverso da 'transactional' e keyword_type 'content_topic'; 'laptop': search_intent 'mixed'; 'kitchen ideas': keyword_type 'content_topic'"
    - id: AC-704-2
      given: "lingua 'it' e le keyword 'come fare la pizza', 'pizzeria vicino a me', 'comprare scarpe running', 'migliori scarpe running prezzo'"
      when: "si chiama classifyKeyword"
      then: "'come fare la pizza': is_question true, keyword_type 'question', search_intent 'informational'; 'pizzeria vicino a me': is_local_intent true e keyword_type 'local'; 'comprare scarpe running': search_intent 'transactional'; 'migliori scarpe running prezzo': search_intent 'commercial' e is_commercial_intent true"
    - id: AC-704-3
      given: "lingua 'en' e le keyword 'how to tie a tie', 'buy running shoes', 'best crm software' (oggi già classificate così)"
      when: "si chiama classifyKeyword"
      then: "'how to tie a tie': keyword_type 'question' e search_intent 'informational'; 'buy running shoes': search_intent 'transactional'; 'best crm software': keyword_type 'tool', search_intent 'commercial', is_tool_intent true"
    - id: AC-704-4
      given: "lingua 'de' e la keyword 'beste app für fotos' (oggi search_intent 'navigational' per la sottostringa 'app')"
      when: "si chiamano classifyKeyword e isClassificationSupported"
      then: "classifyKeyword restituisce keyword_type 'generic', search_intent 'mixed' e i 4 flag false; isClassificationSupported('de') = false, isClassificationSupported('it') = true, isClassificationSupported('en') = true"

  target_tests:
    - file: "tests/unit/classification.test.ts"
      covers: [AC-704-1, AC-704-2, AC-704-3, AC-704-4]

  security_notes:
    - "Nessuna nuova superficie: funzione pura senza I/O, nessun segreto né dato utente coinvolto; l'unico input esterno (la lingua) arriva già normalizzato da lib/constants/locale-options.ts."

  out_of_scope:
    - "Lessici per lingue diverse da it ed en: estensione futura sullo stesso oggetto CLASSIFICATION_LEXICONS."
    - "Riclassificazione delle keyword già salvate: avviene al prossimo run (T-705 aggiorna i campi di classificazione)."

- id: T-705
  title: "Il re-run conserva revisione e selezione"
  macrotask: "extraction-fixes"
  depends_on: [T-106]

  objective: >
    Alla fine di runExtractionPipeline una transazione fa deleteMany di tutte le candidate della
    sezione e createMany delle nuove: ogni re-run azzera review_status e selected_for_export e
    cambia gli id. Secondo D-19 le keyword non più prodotte vanno rimosse, quelle ancora prodotte
    conservano revisione e selezione e ricevono metriche, punteggio e classificazione aggiornati.

  definition_of_done:
    - "lib/modules/pipeline/extraction.ts: la scrittura finale è un upsert sulla chiave unica (subproject_id, canonical_keyword) già presente in prisma/schema.prisma: INSERT ... ON CONFLICT DO UPDATE a blocchi di 500 righe via Prisma.sql parametrizzato; le colonne aggiornate escludono review_status, selected_for_export, id e created_at."
    - "Nella stessa transazione: deleteMany con where { project_id, subproject_id, canonical_keyword: { notIn: <canonical prodotte> } }; le righe di altre sezioni non sono mai incluse nei where."
    - "Le righe nuove ricevono i default di oggi (review_status 'rejected' e selected_for_export false se il brand è escluso, altrimenti 'pending' e true)."
    - "Il commento di testa della funzione documenta D-19 e il caso limite: una keyword il cui canonical cambia per T-702 è trattata come nuova al primo re-run successivo."
    - "tests/integration/rerun-preserves-review.test.ts con autocomplete e metriche mock e commento covers per AC."

  acceptance_criteria:
    - id: AC-705-1
      given: "una sezione già estratta in cui l'utente ha impostato 'approved' su 3 keyword, 'rejected' su 2 e selected_for_export false su 1, e un secondo run che produce ancora 4 di queste 6 keyword"
      when: "si esegue il secondo run con runExtractionPipeline"
      then: "le 4 keyword ancora prodotte hanno lo stesso id, lo stesso review_status e lo stesso selected_for_export di prima del run"
    - id: AC-705-2
      given: "lo stesso scenario, con le altre 2 keyword revisionate non più prodotte e una seconda sezione dello stesso progetto con 15 candidate"
      when: "si esegue il secondo run sulla prima sezione"
      then: "le 2 keyword non più prodotte non esistono più in keyword_candidates (count 0 per quei canonical nella sezione) e la seconda sezione ha ancora 15 candidate con gli stessi id"
    - id: AC-705-3
      given: "un secondo run che produce una keyword mai vista prima e un'altra keyword nuova che contiene un brand escluso (exclude_brands true)"
      when: "si esegue il run"
      then: "la prima ha review_status 'pending' e selected_for_export true; la seconda ha review_status 'rejected' e selected_for_export false"
    - id: AC-705-4
      given: "una keyword approvata con avg_monthly_searches 100 al primo run e un mock di metriche che al secondo run restituisce 900 per lo stesso canonical"
      when: "si esegue il secondo run"
      then: "la riga ha avg_monthly_searches 900, score ricalcolato diverso dal precedente, metrics_updated_at successivo al primo run e review_status ancora 'approved'"

  target_tests:
    - file: "tests/integration/rerun-preserves-review.test.ts"
      covers: [AC-705-1, AC-705-2, AC-705-3, AC-705-4]

  security_notes:
    - "A05 Injection, CWE-89 (SQL Injection): l'upsert in SQL grezzo usa solo Prisma.sql con parametri (keyword e source_query arrivano da Google autocomplete, quindi da una fonte esterna); vietata la concatenazione di stringhe e $executeRawUnsafe."
    - "A01 Broken Access Control, CWE-639: ogni INSERT/UPDATE/DELETE porta project_id e subproject_id del job; la clausola ON CONFLICT usa la chiave unica (subproject_id, canonical_keyword), quindi non può toccare righe di altre sezioni o progetti."

  out_of_scope:
    - "Distinzione tra revisione automatica e manuale (keyword auto-rifiutata per brand poi tolto dalla blacklist resta 'rejected'): non prevista da D-19, da proporre all'utente se serve."
    - "Timeout della transazione e gestione degli errori del job: T-706. Store a passi: T-1202."

- id: T-706
  title: "Job robusti: zero seed, timeout transazione, errori troncati"
  macrotask: "extraction-fixes"
  depends_on: [T-305]

  objective: >
    Tre difetti del ciclo di vita del job: con 0 seed runExtractionPipeline cancella i risultati
    della sezione fuori da qualsiasi transazione e il job risulta completato a zero; la
    $transaction finale non dichiara un timeout e il default di 5 s di Prisma non basta per 6
    createMany da 500 righe su un DB remoto; runJobById salva in jobs.error_message il messaggio
    integrale dell'eccezione (anche i messaggi Prisma con dettagli del DB), lo restituisce al
    client e non logga nulla.

  definition_of_done:
    - "lib/modules/pipeline/extraction.ts: con 0 seed la pipeline lancia NoSeedsError (classe esportata) prima di qualsiasi scrittura; nessun deleteMany fuori transazione."
    - "La transazione finale è invocata con opzioni esplicite { timeout: EXTRACTION_TX_TIMEOUT_MS, maxWait: 10000 }, con EXTRACTION_TX_TIMEOUT_MS = 60000 come costante esportata (letta da env validata se T-201 è già presente)."
    - "lib/modules/jobs/job-runner.ts: helper toPublicJobError(error) che produce il messaggio salvato: NoSeedsError -> «La sezione non ha seed: aggiungi almeno una seed prima di avviare l'estrazione»; errori Prisma noti -> «Errore del database durante il salvataggio dei risultati (<codice Prisma>)»; altri errori -> messaggio troncato a 500 caratteri."
    - "runJobById logga con console.error l'errore completo e lo stack, insieme all'id del job, prima di salvare lo stato failed; il body della risposta delle rotte run contiene solo il messaggio pubblico."
    - "tests/integration/job-runner.test.ts con commento covers per AC."

  acceptance_criteria:
    - id: AC-706-1
      given: "una sezione con 0 seed e 37 keyword_candidates salvate da un run precedente"
      when: "si esegue runJobById sul job di quella sezione"
      then: "il job ha status 'failed' ed error_message «La sezione non ha seed: aggiungi almeno una seed prima di avviare l'estrazione»; la sezione ha ancora 37 keyword_candidates con gli stessi id"
    - id: AC-706-2
      given: "una pipeline che prepara 3.000 candidate e uno spy su prisma.$transaction"
      when: "si esegue runJobById"
      then: "$transaction riceve come secondo argomento un oggetto con timeout = 60000 e maxWait = 10000; il job termina 'completed' con result.storedCandidates = 3000"
    - id: AC-706-3
      given: "una pipeline mockata che lancia un PrismaClientKnownRequestError con codice P2002 e messaggio contenente 'host=db.internal.example'"
      when: "si esegue runJobById"
      then: "jobs.error_message contiene 'P2002' e non contiene 'db.internal.example'; console.error è chiamato 1 volta con un argomento che contiene l'id del job"
    - id: AC-706-4
      given: "una pipeline mockata che lancia new Error con un messaggio di 2.000 caratteri"
      when: "si esegue runJobById"
      then: "jobs.error_message ha lunghezza minore o uguale a 500 caratteri e lo status è 'failed'"

  target_tests:
    - file: "tests/integration/job-runner.test.ts"
      covers: [AC-706-1, AC-706-2, AC-706-3, AC-706-4]

  security_notes:
    - "A10 Mishandling of Exceptional Conditions, CWE-209 (Generation of Error Message Containing Sensitive Information): al client e in jobs.error_message arriva solo il messaggio pubblico di toPublicJobError; il dettaglio Prisma (host, query, vincoli) resta nei log del server."
    - "A09 Security Logging and Alerting Failures, CWE-778 (Insufficient Logging): ogni job fallito produce una riga di log con id del job, codice d'errore e stack; nessun cookie, token o seed dell'utente nel log."
    - "A10, CWE-755 (Improper Handling of Exceptional Conditions): il caso 0 seed non esegue scritture parziali; i risultati esistenti non vengono cancellati da un run che non può produrre nulla."

  out_of_scope:
    - "Codice HTTP delle rotte run per job falliti e messaggio nell'interfaccia: T-305."
    - "Log strutturati e request id: T-602. Job a passi con heartbeat e ripresa: T-1201..T-1203."

- id: T-707
  title: "Punteggio con sorgente esplicita"
  macrotask: "extraction-fixes"
  depends_on: [T-702]

  objective: >
    scoreKeyword (lib/modules/scoring.ts) mescola due scale: metricsScore per le keyword misurate e
    heuristicScore per le altre; una keyword senza metriche come 'scarpe running uomo' vale 88,
    più di una misurata con 1.000 ricerche e competizione 0,5 (51,25), quindi in testa ai risultati
    finiscono le keyword non misurate. Inoltre keywordCleanlinessScore riceve normalizedKeyword,
    già ripulita dai simboli, e non penalizza mai il rumore. Il task salva la sorgente del punteggio
    e ordina i risultati secondo D-18.

  definition_of_done:
    - "prisma/schema.prisma: enum ScoreSource { metrics heuristic } (metrics dichiarato per primo) e colonna keyword_candidates.score_source ScoreSource con default heuristic; migrazione SQL con backfill: metrics per le righe con metrics_status in (fetched, imported, mock), heuristic per le altre."
    - "lib/modules/scoring.ts: scoreKeyword restituisce { score, score_source }; ScoreInput ha raw_keyword (keyword originale) usato da keywordCleanlinessScore e keyword (normalizzata) usato per il conteggio delle parole."
    - "Ordinamento D-18 in una costante unica RESULTS_ORDER_BY in lib/modules/results-order.ts = [{ score_source: 'asc' }, { score: 'desc' }, { keyword: 'asc' }, { id: 'asc' }], usata da app/projects/[id]/results/page.tsx, app/api/projects/[id]/results/route.ts e getExportRows in lib/modules/export.ts (il file è creato dal primo tra T-707 e T-801; l'altro lo riusa)."
    - "Export CSV/XLSX/JSON e Google Sheets includono la colonna score_source dopo score; la caratterizzazione T-107 è aggiornata con gate umano."
    - "tests/unit/scoring.test.ts e tests/integration/results-order.test.ts con commento covers per AC."

  acceptance_criteria:
    - id: AC-707-1
      given: "metrics_status rispettivamente 'fetched', 'imported', 'mock', 'missing' e 'failed'"
      when: "si chiama scoreKeyword"
      then: "score_source vale 'metrics' per i primi tre e 'heuristic' per gli ultimi due"
    - id: AC-707-2
      given: "raw_keyword '!!!! offerte $$$$', keyword normalizzata 'offerte', metrics_status 'missing', search_intent 'mixed', brand 'allowed', profilo 'balanced'"
      when: "si chiama scoreKeyword"
      then: "score = 62,5 (pulizia 0,55 calcolata sul testo grezzo) invece dell'80,5 di oggi; con raw_keyword 'offerte' lo score resta 80,5"
    - id: AC-707-3
      given: "nella stessa sezione la keyword A senza metriche (score euristico 88) e la keyword B con avg_monthly_searches 1000 e competition 0,5 (score da metriche circa 51,25)"
      when: "si leggono le righe con prisma.keywordCandidate.findMany con orderBy RESULTS_ORDER_BY e tramite GET /api/projects/[id]/export?format=json&scope=filtered"
      then: "in entrambi i casi B precede A; B ha score_source 'metrics' e A ha score_source 'heuristic'"
    - id: AC-707-4
      given: "un run di estrazione con metriche MOCK"
      when: "si leggono le righe salvate"
      then: "tutte le righe hanno score_source 'metrics' e nessuna ha score_source nullo"

  target_tests:
    - file: "tests/unit/scoring.test.ts"
      covers: [AC-707-1, AC-707-2]
    - file: "tests/integration/results-order.test.ts"
      covers: [AC-707-3, AC-707-4]

  security_notes:
    - "A08 Software or Data Integrity Failures, CWE-1188 (Initialization of a Resource with an Insecure Default): la migrazione è additiva con backfill deterministico in un'unica transazione; nessuna riga resta con sorgente non valorizzata e nessun dato esistente viene cancellato (D-05 ammette migrazioni drastiche, qui non servono)."
    - "Le query di lettura ordinate mantengono il filtro project_id del progetto posseduto dall'utente (A01, CWE-639): il task cambia solo orderBy, mai il where."

  out_of_scope:
    - "Paginazione stabile e conteggi: T-801. Indice per l'ordinamento dei risultati: T-1103."
    - "Ricalcolo del punteggio dopo import dei volumi da CSV: T-905."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
