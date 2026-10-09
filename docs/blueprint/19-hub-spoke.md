# 19-hub-spoke — Macrotask `hub-spoke`

> Strategia di contenuti hub and spoke generata dalle keyword del progetto: pagine pilastro (hub) e articoli satellite (spoke), con H1 e H2 suggeriti, modificabile nell'app ed esportabile in CSV, Excel, Google Sheets e PDF. Nasce dalla richiesta dell'utente del 2026-10-09 (brainstorming con design approvato per sezioni): dopo l'analisi delle keyword il SEO manager deve impostare la strategia editoriale, e la funzione deve servire anche ai meno esperti.

## Obiettivo del macrotask
Oggi Titan SEO si ferma alla lista di keyword revisionate ed esportate: l'utente deve costruire a mano la strategia di contenuti. Il macrotask aggiunge, per ogni progetto, strategie hub and spoke **deterministiche e gratuite** (D-33): nessuna analisi della SERP, nessuno scraping, nessun modello AI; tutto si calcola dalle keyword già estratte (normalizzazione di T-702, intento, tipo, flag, volume, punteggio, seed delle sezioni). Due modi d'uso: **automatico** (un clic, impostazioni predefinite, per i meno esperti) ed **esperto** (perimetro e regole scelti dall'utente). Il piano si modifica nell'app (sposta keyword, riscrivi H1 e H2, promuovi, unisci, elimina) e si esporta, anche in un PDF da presentare al cliente (D-34). Ogni strategia è una fotografia delle keyword al momento della generazione: le estrazioni successive (D-19) non la cambiano.

## Task atomici

```yaml
- id: T-1901
  title: "Motore di raggruppamento hub and spoke e modello dati delle strategie"
  macrotask: "hub-spoke"
  depends_on: [T-702, T-1501]

  objective: >
    Raggruppare in modo deterministico le keyword di un perimetro in hub (pagine pilastro) e spoke (articoli
    satellite), con keyword principale e secondarie per pagina, tipo di contenuto, priorità e motivo, e salvare le
    strategie in tabelle proprie che fotografano le keyword.

  definition_of_done:
    - "Migrazione 0039_strategies: tabella strategies (project_id con cascade, name fino a 120 caratteri, created_by_user_id con SET NULL, mode AUTO o EXPERT, settings Json con perimetro e regole, language, considered_count, assigned_count, unassigned_count, truncated, version intera da 0, timestamp); tabella strategy_pages (strategy_id con cascade, kind HUB o SPOKE, hub_page_id dello spoke, h1 fino a 200 caratteri, h2 come elenco di testi, h1_edited e h2_edited, content_type tra guide, list, comparison, product_category, faq, local, tool, priority, position, reason_code e reason_params Json); tabella strategy_keywords (strategy_id con cascade, page_id con SET NULL per le non assegnate, role MAIN o SECONDARY, keyword, canonical_keyword, volume, score, score_source, search_intent, keyword_type, is_question, is_local, source_keyword_id solo informativo e senza chiave esterna). Vincolo unico (strategy_id, canonical_keyword) e indice unico parziale su page_id con role MAIN; RLS abilitata senza policy sulle tre tabelle (D-20)."
    - "lib/modules/strategy/modifiers.ts: per italiano e inglese parole vuote (articoli, preposizioni) e dizionari dei modificatori per categoria: comparison (migliori, recensioni, opinioni, vs, classifica, best, review…), transactional (prezzo, costo, offerte, comprare, economico, price, buy…), informational (come, cosa, perché, quale, guida, how, what, guide…), tool (calcolatore, generatore, online, gratis, calculator…), local (vicino a me, near me). Modulo puro."
    - "lib/modules/strategy/cluster.ts: buildStrategyPlan({ keywords, seeds, language, rules }) funzione pura senza accesso al DB. Passi: parole della forma canonica senza parole vuote, singolare e plurale equivalenti (italiano: stessa radice con vocale finale diversa; inglese: s o es finale; parole di almeno 4 lettere); un hub candidato per ogni seed del perimetro, con le keyword che ne contengono tutte le parole assegnate all'hub più specifico; senza corrispondenze con le seed (keyword importate), hub dai termini più ricorrenti pesati per volume; dentro l'hub il resto della keyword senza il nucleo dell'hub: stesso resto in qualunque ordine = varianti della stessa pagina, stesso modificatore o stessa parola = stesso spoke; uno spoke nasce con almeno minKeywordsPerSpoke keyword o con volume complessivo almeno minSpokeVolume, altrimenti le keyword vanno alla pagina pilastro; oltre maxSpokesPerHub gli spoke a priorità più bassa confluiscono nella pagina pilastro; domande sotto questionSpokeVolume nella FAQ della pagina più vicina (con questionsAs faq) oppure sempre spoke (con questionsAs spokes); keyword principale = volume più alto, poi punteggio, poi testo più corto, poi ordine alfabetico; tipo di contenuto da una tabella intento × categoria del modificatore; priorità = volume complessivo della pagina, o punteggio euristico senza volumi (come D-18); ordine di lavoro (position) = hub in ordine decrescente di volume complessivo dell'hub (pilastro più spoke), ciascuno seguito dai propri spoke in ordine di priorità; non assegnate = keyword senza hub."
    - "Regole predefinite della modalità automatica in lib/modules/strategy/rules.ts: minKeywordsPerSpoke 2, minSpokeVolume 100, maxSpokesPerHub 12, questionSpokeVolume 200, questionsAs faq; schema zod dei limiti ammessi per la modalità esperta."
    - "Lingue diverse da italiano e inglese: nessun dizionario dei modificatori, raggruppamento solo per parole condivise, nessun errore."
    - "Fixture tests/fixtures/strategy/: un insieme italiano con seed (per esempio scarpe running con varianti di prezzo, confronto, domande e plurali) e un insieme inglese senza seed corrispondenti, ciascuno con il piano atteso scritto a mano."

  acceptance_criteria:
    - id: AC-1901-1
      given: "la fixture italiana con la seed 'scarpe running' e le regole predefinite"
      when: "si chiama buildStrategyPlan"
      then: "il piano restituito è uguale al piano atteso della fixture: hub, spoke, keyword principale e secondarie di ogni pagina, tipi di contenuto, ordine di priorità e keyword non assegnate"
    - id: AC-1901-2
      given: "la fixture italiana e 50 permutazioni casuali con seme fisso dell'ordine delle sue keyword"
      when: "si chiama buildStrategyPlan su ogni permutazione"
      then: "tutti i piani sono identici; in ciascuno ogni keyword compare in al massimo una pagina e ogni pagina ha esattamente una keyword principale"
    - id: AC-1901-3
      given: "la fixture inglese, le cui keyword non contengono le parole di alcuna seed"
      when: "si chiama buildStrategyPlan"
      then: "gli hub del piano coincidono con quelli attesi dai termini più ricorrenti pesati per volume e il piano è uguale a quello atteso della fixture"
    - id: AC-1901-4
      given: "un hub con un gruppo di 1 keyword a volume 40, 14 gruppi idonei a diventare spoke e la lingua 'de' in un secondo caso"
      when: "si chiama buildStrategyPlan con le regole predefinite"
      then: "la keyword del gruppo da 1 è secondaria della pagina pilastro; l'hub ha 12 spoke e le keyword dei 2 gruppi a priorità più bassa sono nella pagina pilastro; con la lingua 'de' il piano viene restituito senza errori e senza categorie di modificatore"
    - id: AC-1901-5
      given: "il DB di test migrato fino a 0039"
      when: "si inseriscono due keyword con la stessa canonical_keyword nella stessa strategia, poi due keyword MAIN nella stessa pagina, e si legge relrowsecurity delle tre tabelle"
      then: "entrambi gli inserimenti falliscono per violazione di un vincolo unico e le tre tabelle hanno relrowsecurity true"

  target_tests:
    - file: "tests/unit/strategy-cluster.test.ts"
      covers: [AC-1901-1, AC-1901-2, AC-1901-3, AC-1901-4]
    - file: "tests/integration/strategy-schema.test.ts"
      covers: [AC-1901-5]

  security_notes:
    - "A06 Insecure Design / CWE-400 (Uncontrolled Resource Consumption): il motore lavora in memoria su al massimo 5000 keyword (D-35) con complessità lineare nel numero di keyword per hub."

  out_of_scope:
    - "Raggruppamento per significato (embeddings): evoluzione futura, non in questo macrotask."
    - "Sotto-hub: il piano ha due livelli, hub e spoke."
    - "Analisi della SERP, scraping dei competitor, modelli AI (D-33)."

- id: T-1902
  title: "H1 e H2 a modelli fissi e spiegazioni dei motivi"
  macrotask: "hub-spoke"
  depends_on: [T-1901, T-1302]

  objective: >
    Proporre per ogni pagina del piano un H1 e una lista di H2 costruiti gratis da modelli fissi per tipo di contenuto
    e lingua, riempiti con le keyword della pagina, e spiegare con un testo tradotto perché ogni pagina esiste.

  definition_of_done:
    - "lib/modules/strategy/titles.ts: buildPageTitles(page, context) funzione pura con il traduttore iniettato; lingua dei titoli = lingua del perimetro (language_code_override della sezione, altrimenti language_code del progetto); modelli solo per italiano e inglese, per le altre lingue H1 = keyword principale con l'iniziale maiuscola e H2 = secondarie con l'iniziale maiuscola."
    - "Modelli degli H1 nei cataloghi messages/it.json e messages/en.json (namespace strategy.templates), almeno due varianti per guide, list, comparison, product_category, faq, local e tool, con i segnaposto {keyword} e {year}; variante scelta in modo stabile da un hash della keyword principale; nessun modello che richieda l'accordo di genere o numero; se la keyword contiene già una parola del modello (guida, migliori, online…) quella parola non viene ripetuta."
    - "H2 di uno spoke: uno per gruppo di keyword secondarie (le varianti dello stesso gruppo danno un solo H2, dalla più cercata), domande con iniziale maiuscola e punto interrogativo, altre keyword con iniziale maiuscola, H2 fisso di chiusura per tipo (Domande frequenti se ci sono domande, Come abbiamo scelto per le liste), al massimo 12 H2. H2 della pagina pilastro: uno per spoke in ordine di priorità, poi i gruppi confluiti, poi Domande frequenti se ci sono domande."
    - "Spiegazioni dei motivi nei cataloghi (namespace strategy.reasons) per ogni reason_code di T-1901 (hub da seed, hub da termine ricorrente, spoke per modificatore, spoke per parola, spoke di domanda, gruppo confluito nella pilastro, non assegnata), con i parametri del motivo."

  acceptance_criteria:
    - id: AC-1902-1
      given: "una pagina guide con keyword principale 'guida scarpe running' in italiano e una pagina tool con keyword principale 'calcolatore passo online'"
      when: "si chiama buildPageTitles"
      then: "l'H1 della prima contiene la parola 'guida' una sola volta e l'H1 della seconda contiene la parola 'online' una sola volta"
    - id: AC-1902-2
      given: "uno spoke con le secondarie 'come allacciare le scarpe running', 'scarpe running prezzo', 'scarpe running prezzi' e altre 14 secondarie in gruppi distinti"
      when: "si chiama buildPageTitles"
      then: "l'H2 della domanda è 'Come allacciare le scarpe running?'; 'scarpe running prezzo' e 'scarpe running prezzi' producono un solo H2; la lista contiene esattamente 12 H2"
    - id: AC-1902-3
      given: "una pagina pilastro con 3 spoke a priorità diversa e 2 domande confluite nella FAQ"
      when: "si chiama buildPageTitles"
      then: "i primi 3 H2 sono le keyword principali dei 3 spoke con l'iniziale maiuscola in ordine di priorità e l'ultimo H2 è il testo della chiave strategy.fixedH2.faq"
    - id: AC-1902-4
      given: "la stessa pagina italiana generata due volte e una pagina con lingua 'de' e keyword principale 'laufschuhe test'"
      when: "si chiama buildPageTitles"
      then: "le due generazioni italiane hanno lo stesso H1; la pagina tedesca ha H1 'Laufschuhe test'"
    - id: AC-1902-5
      given: "i cataloghi messages/it.json e messages/en.json"
      when: "si confrontano le chiavi sotto strategy e si analizzano i messaggi con il parser ICU"
      then: "le due lingue hanno lo stesso insieme di chiavi sotto strategy, ogni reason_code di T-1901 ha una voce in strategy.reasons e nessun messaggio dà errore di parsing"

  target_tests:
    - file: "tests/unit/strategy-titles.test.ts"
      covers: [AC-1902-1, AC-1902-2, AC-1902-3, AC-1902-4, AC-1902-5]

  security_notes:
    - "A05 Injection / CWE-79 (Cross-site Scripting): i titoli sono testo; le keyword vengono dall'estrazione e dall'utente e non sono mai rese come HTML né nell'app né nel PDF."

  out_of_scope:
    - "Validazione dei titoli contro i contenuti dei competitor (D-33)."
    - "Brief completi di contenuto oltre H1 e H2."

- id: T-1903
  title: "Generazione, lettura, rinomina ed eliminazione delle strategie"
  macrotask: "hub-spoke"
  depends_on: [T-1901, T-1902, T-1502]

  objective: >
    Esporre le API che generano una strategia dal perimetro scelto (modalità automatica o esperta) e la salvano, la
    elencano, la leggono, la rinominano e la eliminano, con autorizzazione per workspace e limiti tecnici.

  definition_of_done:
    - "POST /api/projects/[id]/strategies con { mode, name?, settings? }: perimetro automatico = keyword del progetto con review_status diverso da rejected e brand_status diverso da excluded, regole predefinite; perimetro esperto = progetto o sezione, approved oppure approved e pending, volume minimo, intento e tipo (stesse clausole dei filtri dei risultati), regole entro i limiti dello schema; generazione con buildStrategyPlan e buildPageTitles; salvataggio in una transazione; risposta 201 con l'id."
    - "Oltre 5000 keyword nel perimetro si prendono le 5000 a priorità più alta e truncated vale true (D-35); con 0 keyword 409 STRATEGY_NO_KEYWORDS; con 20 strategie già nel progetto 409 STRATEGY_LIMIT (D-35); impostazioni non valide 400 VALIDATION_ERROR."
    - "GET /api/projects/[id]/strategies (elenco con nome, modalità, data e conteggi), GET /api/projects/[id]/strategies/[strategyId] (piano completo con pagine, H1, H2, keyword, motivi e non assegnate), PATCH dello stesso percorso con { name, version }, DELETE dello stesso percorso; strategia di un altro progetto 404 STRATEGY_NOT_FOUND."
    - "Permesso strategy.write di livello MEMBER in WORKSPACE_PERMISSIONS per generare, rinominare ed eliminare; lettura con project.read; progetto fuori dal workspace dell'utente 404 come le altre rotte del progetto (T-1502); scritture con il perimetro del workspace nel where, regola estesa a strategy, strategyPage e strategyKeyword in tests/tooling/workspace-scoped-writes.test.ts."
    - "Codici STRATEGY_NO_KEYWORDS, STRATEGY_LIMIT, STRATEGY_NOT_FOUND e STRATEGY_CONFLICT in API_ERROR_CODES e nei cataloghi errors.* it ed en."

  acceptance_criteria:
    - id: AC-1903-1
      given: "un MEMBER del workspace W e il progetto P di W con keyword approved, pending, rejected e con brand_status excluded"
      when: "invia POST /api/projects/P/strategies con mode AUTO"
      then: "la risposta è 201; la strategia contiene le keyword approved e pending e nessuna keyword rejected o excluded; considered_count è uguale alla somma di assigned_count e unassigned_count"
    - id: AC-1903-2
      given: "un utente di un altro workspace e una strategia S del progetto P"
      when: "chiama POST, GET e DELETE su /api/projects/P/strategies e su /api/projects/P/strategies/S, e un MEMBER di W chiama GET su S con l'id di un altro progetto nel percorso"
      then: "l'utente dell'altro workspace riceve 404 su ogni chiamata e S esiste ancora; il MEMBER riceve 404 STRATEGY_NOT_FOUND"
    - id: AC-1903-3
      given: "un progetto con 20 strategie, un progetto senza keyword e un corpo con rules.maxSpokesPerHub uguale a 0"
      when: "si invia POST /api/projects/[id]/strategies per ciascun caso"
      then: "le risposte sono 409 STRATEGY_LIMIT, 409 STRATEGY_NO_KEYWORDS e 400 VALIDATION_ERROR e nessuna strategia nuova viene salvata"
    - id: AC-1903-4
      given: "un progetto con 5003 keyword non escluse e volumi tutti diversi"
      when: "si invia POST con mode AUTO"
      then: "la strategia ha considered_count 5000 e truncated true e le 3 keyword assenti sono le 3 a volume più basso"
    - id: AC-1903-5
      given: "un progetto con le sezioni S1 e S2 e keyword approved e pending con volumi sopra e sotto 100 in entrambe"
      when: "si invia POST con mode EXPERT, scope sezione S1, solo approved e volume minimo 100"
      then: "la strategia contiene solo le keyword approved di S1 con volume maggiore o uguale a 100"

  target_tests:
    - file: "tests/integration/strategy-api.test.ts"
      covers: [AC-1903-1, AC-1903-2, AC-1903-3, AC-1903-4, AC-1903-5]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (Authorization Bypass Through User-Controlled Key): progetto e strategia si risolvono sempre dentro il workspace dell'utente; nessun id accettato senza il controllo del perimetro."
    - "A06 Insecure Design / CWE-770 (Allocation of Resources Without Limits or Throttling): tetto di 5000 keyword per strategia e di 20 strategie per progetto (D-35)."

  out_of_scope:
    - "Limiti per piano commerciale: si legano a D-14 quando i valori esistono."

- id: T-1904
  title: "Modifiche al piano con controllo delle versioni"
  macrotask: "hub-spoke"
  depends_on: [T-1903]

  objective: >
    Permettere all'utente di riscrivere H1, H2 e tipo di contenuto e di cambiare la struttura del piano (spostare
    keyword, promuovere a hub, unire ed eliminare pagine) mantenendo sempre le regole del piano e senza sovrascrivere
    le modifiche contemporanee di un altro membro.

  definition_of_done:
    - "PATCH /api/projects/[id]/strategies/[strategyId]/pages/[pageId] con { version, h1?, h2?, contentType? }: h1 da 1 a 200 caratteri, h2 al massimo 30 voci da 1 a 200 caratteri, contentType dall'elenco; imposta h1_edited o h2_edited."
    - "POST /api/projects/[id]/strategies/[strategyId]/operations con { version, operation }: move_keywords (keywordIds, targetPageId o null per le non assegnate), promote_to_hub (pageId), merge_pages (sourcePageId, targetPageId), delete_page (pageId); ogni operazione in una transazione."
    - "Regole mantenute dopo ogni operazione: una sola keyword principale per pagina (se la principale esce, diventa principale la secondaria a priorità più alta); una pagina senza keyword viene eliminata; eliminare un hub rende hub i suoi spoke e porta le keyword dell'hub tra le non assegnate; unire porta tutte le keyword nella pagina di destinazione e ricalcola gli H2 solo se h2_edited è false; conteggi della strategia aggiornati."
    - "version della strategia confrontata a ogni modifica e incrementata a ogni modifica riuscita; version diversa da quella salvata → 409 STRATEGY_CONFLICT senza modifiche."

  acceptance_criteria:
    - id: AC-1904-1
      given: "uno spoke A con la principale da 900 ricerche e le secondarie da 500 e 300, e uno spoke B"
      when: "si sposta in B la principale di A con move_keywords"
      then: "la principale di A è la keyword da 500; la keyword da 900 è secondaria di B; il numero totale di keyword della strategia non cambia"
    - id: AC-1904-2
      given: "uno spoke con una sola keyword e un hub H con 2 spoke"
      when: "si sposta tra le non assegnate l'unica keyword dello spoke e poi si elimina H con delete_page"
      then: "lo spoke svuotato non esiste più; i 2 spoke di H hanno kind HUB; le keyword di H hanno page_id null"
    - id: AC-1904-3
      given: "le pagine A e B con h2_edited false su B, e le pagine C e D con h2_edited true su D"
      when: "si uniscono A in B e C in D con merge_pages"
      then: "B contiene le keyword di A e B e i suoi H2 sono ricalcolati da buildPageTitles; D contiene le keyword di C e D e i suoi H2 sono invariati"
    - id: AC-1904-4
      given: "una strategia alla version 3"
      when: "due richieste di operazione arrivano entrambe con version 3"
      then: "la prima risponde 200 e porta la strategia alla version 4; la seconda risponde 409 STRATEGY_CONFLICT e il piano contiene solo l'effetto della prima"
    - id: AC-1904-5
      given: "una pagina del piano"
      when: "si invia PATCH con un h1 di 201 caratteri, poi con 31 H2, poi con un h1 valido"
      then: "le prime due risposte sono 400 VALIDATION_ERROR senza modifiche; la terza è 200 e la pagina ha il nuovo h1 e h1_edited true"

  target_tests:
    - file: "tests/integration/strategy-operations.test.ts"
      covers: [AC-1904-1, AC-1904-2, AC-1904-3, AC-1904-4, AC-1904-5]

  security_notes:
    - "A01 / CWE-639: pagine e keyword di un'operazione devono appartenere alla strategia del percorso; id di un'altra strategia → 404 STRATEGY_NOT_FOUND."
    - "A04 / CWE-362 (Race Condition): il controllo della version impedisce che una modifica contemporanea ne sovrascriva un'altra."

  out_of_scope:
    - "Annulla e ripeti delle modifiche."
    - "Rigenerazione in place: rigenerare crea sempre una strategia nuova."

- id: T-1905
  title: "Pagina Strategia: modalità automatica ed esperta, vista del piano e modifiche"
  macrotask: "hub-spoke"
  depends_on: [T-1903, T-1904, T-1302]

  objective: >
    Dare all'utente una pagina in cui generare la strategia con un clic o con le impostazioni avanzate, leggere il
    piano per hub, aprire ogni pagina con H1, H2, keyword, motivo e link interni, e modificarlo.

  definition_of_done:
    - "Pagine app/projects/[id]/strategy/page.tsx (elenco delle strategie, pulsante Genera strategia, pannello Impostazioni avanzate chiuso di default con perimetro e regole) e app/projects/[id]/strategy/[strategyId]/page.tsx (sintesi, hub con pagina pilastro e tabella degli spoke, dettaglio della pagina con H1, H2, keyword, motivo tradotto e link interni previsti, riquadro Non assegnate, controlli di modifica, etichetta 'suggerito' sui titoli non modificati, ricarica del piano dopo un 409 STRATEGY_CONFLICT)."
    - "Link alla pagina Strategia dalla pagina del progetto e dalla pagina dei risultati; testi nei cataloghi it ed en (namespace strategy.ui); componenti in components/strategy/ che importano solo tipi da lib/modules/strategy/types.ts (D-22)."
    - "Pulsanti e campi con etichette accessibili e uso completo da tastiera."

  acceptance_criteria:
    - id: AC-1905-1
      given: "un progetto E2E con le keyword della fixture italiana di T-1901"
      when: "l'utente apre la pagina Strategia e preme Genera strategia senza aprire le impostazioni avanzate"
      then: "il browser arriva alla pagina della strategia, che mostra almeno 1 hub con il suo H1 e il riquadro Non assegnate con il numero delle keyword non assegnate"
    - id: AC-1905-2
      given: "la strategia generata in AC-1905-1"
      when: "l'utente sposta dall'interfaccia una keyword secondaria in un'altra pagina e ricarica"
      then: "dopo il ricaricamento la keyword compare nella pagina di destinazione e non in quella di partenza"
    - id: AC-1905-3
      given: "il componente delle impostazioni della pagina Strategia"
      when: "si rende il componente, si apre il pannello avanzato e si invia con scope sezione e solo approvate"
      then: "il pannello è chiuso alla prima resa; dopo l'apertura mostra i campi di perimetro e regole; la richiesta inviata ha mode EXPERT e le impostazioni scelte"
    - id: AC-1905-4
      given: "la scheda di una pagina con h1_edited false e una con h1_edited true"
      when: "si rendono le due schede"
      then: "la prima mostra l'etichetta 'suggerito' accanto all'H1, la seconda no"
    - id: AC-1905-5
      given: "la pagina della strategia generata in AC-1905-1"
      when: "si esegue axe sulla pagina"
      then: "axe riporta 0 violazioni serious o critical"

  target_tests:
    - file: "tests/e2e/strategy.spec.ts"
      covers: [AC-1905-1, AC-1905-2, AC-1905-5]
    - file: "tests/component/strategy-settings.test.tsx"
      covers: [AC-1905-3]
    - file: "tests/component/strategy-page-card.test.tsx"
      covers: [AC-1905-4]

  security_notes:
    - "A05 Injection / CWE-79: keyword, H1 e H2 resi come testo da React, mai con HTML grezzo."

  out_of_scope:
    - "Mappa grafica interattiva degli hub: la vista è a schede e tabelle."
    - "Trascinamento delle keyword: lo spostamento avviene con selezione e scelta della destinazione."

- id: T-1906
  title: "Export della strategia in CSV, Excel e Google Sheets"
  macrotask: "hub-spoke"
  depends_on: [T-1903, T-804, T-806]

  objective: >
    Esportare il piano con una riga per pagina nei formati che l'app già usa per i risultati, con le stesse
    protezioni.

  definition_of_done:
    - "GET /api/projects/[id]/strategies/[strategyId]/export?format=csv|xlsx: colonne hub, tipo pagina, H1, H2 uniti da ' | ', keyword principale, keyword secondarie unite da ' | ', tipo di contenuto, volume, priorità, link interni (gli spoke verso il proprio hub, l'hub verso i propri spoke); righe nell'ordine di lavoro; CSV nel dialetto excel-it di default con l'opzione rfc4180 (T-804); stessa protezione dalle formule dell'export dei risultati; nomi di file con nome della strategia normalizzato."
    - "Export su Google Sheets della strategia con il flusso OAuth e lo scope di T-906 e T-806, foglio 'strategia', stesse colonne."
    - "Permesso export.run; progetto fuori dal workspace 404."

  acceptance_criteria:
    - id: AC-1906-1
      given: "una strategia con 1 hub e 2 spoke"
      when: "si scarica l'export CSV"
      then: "il file ha l'intestazione e 3 righe nell'ordine di lavoro; la colonna H2 di ogni riga contiene gli H2 della pagina uniti da ' | '; i link interni degli spoke indicano l'H1 dell'hub"
    - id: AC-1906-2
      given: "una pagina con H1 che inizia con '='"
      when: "si scaricano gli export CSV e XLSX"
      then: "nel CSV la cella ha la stessa protezione dalle formule dell'export dei risultati e nell'XLSX la cella è di tipo testo"
    - id: AC-1906-3
      given: "un utente di un altro workspace"
      when: "chiede l'export CSV della strategia"
      then: "riceve 404 e nessun file"
    - id: AC-1906-4
      given: "un account Google Sheets collegato e l'API di Google simulata"
      when: "si esporta la strategia su Google Sheets"
      then: "le righe scritte nel foglio 'strategia' coincidono con le righe dell'export CSV"

  target_tests:
    - file: "tests/integration/strategy-export.test.ts"
      covers: [AC-1906-1, AC-1906-2, AC-1906-3, AC-1906-4]

  security_notes:
    - "A05 Injection / CWE-1236 (Improper Neutralization of Formula Elements in a CSV File): stessa neutralizzazione delle formule dell'export dei risultati."

  out_of_scope:
    - "Export JSON della strategia."

- id: T-1907
  title: "Export della strategia in PDF da presentare"
  macrotask: "hub-spoke"
  depends_on: [T-1906, T-506]

  objective: >
    Generare dal server, senza servizi esterni, un PDF da consegnare al cliente: spiegazione della strategia, sintesi,
    ordine di lavoro, sezioni per hub con H1, H2, spoke, motivi e link interni, appendice con criteri e keyword non
    assegnate.

  definition_of_done:
    - "Dipendenza @react-pdf/renderer a versione esatta (D-34), npm audit senza advisory high o critical; nessun browser headless."
    - "lib/modules/strategy/pdf.tsx: copertina (nome del progetto, nome della strategia, data, workspace, nome e logo dal branding di T-506 quando il logo è un'immagine raggiungibile, altrimenti il solo nome), pagina 'Cos'è la strategia hub and spoke' con testo fisso dei cataloghi, sintesi (hub, pagine, keyword coperte, volume complessivo, non assegnate, troncamento a 5000 se presente), ordine di lavoro, una sezione per hub (pagina pilastro con H1 e H2, tabella degli spoke, motivo tradotto di ogni pagina, link interni), appendice (keyword non assegnate e criteri della strategia)."
    - "GET /api/projects/[id]/strategies/[strategyId]/export?format=pdf&lang=it|en: lingua delle spiegazioni = lang, di default la lingua dell'interfaccia; H1, H2 e keyword nella lingua del progetto; risposta application/pdf come allegato con Cache-Control no-store; testi resi solo come testo."
    - "Nel test il testo del PDF si estrae con una libreria di sola lettura in devDependencies a versione esatta."

  acceptance_criteria:
    - id: AC-1907-1
      given: "una strategia con 2 hub del progetto 'Progetto PDF'"
      when: "si scarica l'export con format pdf"
      then: "la risposta è 200 con Content-Type application/pdf e Content-Disposition attachment; il corpo inizia con '%PDF-'; il testo estratto contiene 'Progetto PDF' e l'H1 di entrambi gli hub"
    - id: AC-1907-2
      given: "la stessa strategia di un progetto in italiano"
      when: "si scarica il PDF con lang en"
      then: "il testo estratto contiene il titolo inglese della pagina di spiegazione dal catalogo en e gli H1 italiani delle pagine"
    - id: AC-1907-3
      given: "una pagina con H1 '<script>alert(1)</script> guida'"
      when: "si scarica il PDF"
      then: "la risposta è 200 e il testo estratto contiene la stringa '<script>alert(1)</script> guida'"
    - id: AC-1907-4
      given: "il lockfile con @react-pdf/renderer"
      when: "si esegue il test di audit delle dipendenze di produzione"
      then: "il test riporta 0 advisory high o critical non in allowlist"

  target_tests:
    - file: "tests/integration/strategy-pdf.test.ts"
      covers: [AC-1907-1, AC-1907-2, AC-1907-3]
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-1907-4]

  security_notes:
    - "A03 Software Supply Chain Failures / CWE-1395: libreria PDF a versione esatta, lockfile aggiornato, audit senza high o critical."
    - "A05 Injection / CWE-79: nel PDF i testi dell'utente sono solo testo, nessun HTML interpretato."

  out_of_scope:
    - "Personalizzazione grafica del PDF per workspace oltre al branding dell'app."
    - "Invio del PDF per email."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
- Design approvato dall'utente per sezioni il 2026-10-09: esperienza d'uso (automatica ed esperta, rigenerazione che crea una strategia nuova, export anche in PDF), dati (fotografia delle keyword), raggruppamento deterministico, H1 e H2 a modelli fissi, API e modifiche, test e struttura del macrotask.
- Scartati con l'utente: analisi della SERP con API a pagamento, scraping dei competitor (vietato da D-09 e dai termini di Google), riuso di SEO Lens e SEO Sentinel (il primo audita un solo URL e non conosce la SERP, il secondo per sua regola gira solo in locale), titoli scritti da un modello AI.
- Rilievi da confermare: soglie predefinite (minKeywordsPerSpoke 2, minSpokeVolume 100, maxSpokesPerHub 12, questionSpokeVolume 200) e limiti tecnici di D-35; AC-1907-4 riusa come oracolo il test di audit delle dipendenze del macrotask 04 (tests/tooling/dependency-audit.test.ts), che riceverà il tag covers di AC-1907-4; il link alla pagina Strategia nella pagina dei risultati cambia la baseline visiva dei risultati di T-103: la rigenerazione è un gate umano (modulo 04), da approvare prima del merge come nel macrotask 18.
