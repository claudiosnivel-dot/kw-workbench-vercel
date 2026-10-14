# 25-ux-plan — Macrotask `ux-plan`

> Terzo dei quattro moduli della nuova esperienza d'uso (D-39, brainstorming del 2026-10-13 con mockup approvati per sezioni). Trasforma la strategia hub and spoke nel piano dei contenuti del progetto: una bacheca in stile Trello divisa per pagine principali, un pannello di dettaglio che si modifica scrivendo, lo stato di scrittura di ogni pagina e un solo piano per progetto con lo storico delle versioni.

## Obiettivo del macrotask
Oggi la pagina della strategia è alta circa 12.500 px, con gli strumenti di modifica sempre aperti su ogni pagina, e ogni rigenerazione aggiunge una strategia all'elenco. Dopo questo modulo:

- **Un solo piano per progetto**: il piano è la strategia più recente. «Rigenera» riorganizza solo le pagine non ancora iniziate, mentre quelle in scrittura o pubblicate restano com'erano, con titoli, keyword e stato. Le strategie precedenti si consultano in sola lettura tra le versioni precedenti.
- **La bacheca (T1)**: una colonna per pagina principale, con in cima la sua scheda e sotto gli approfondimenti nell'ordine in cui scriverli, più la colonna «Senza pagina» con le keyword rimaste fuori. Le schede si trascinano sotto un'altra pagina principale e le keyword si trascinano su una scheda. C'è anche la vista elenco.
- **Lo stato di scrittura (T2)**: ogni pagina è Da scrivere, In scrittura o Pubblicata. «Raggruppa per: Stato» mostra la stessa bacheca divisa per stato, e una barra in alto riassume l'avanzamento.
- **Il pannello di dettaglio** si apre cliccando una scheda: titolo, scaletta, tipo, keyword, motivo e collegamenti, modificabili scrivendo con salvataggio automatico; le azioni rare stanno nel menu ⋯.
- **La scrittura entra nel percorso**: terza tappa della barra laterale, «prossima pagina da scrivere» come prossimo passo, avanzamento sulla scheda del progetto nella home, stato nell'export e, a scelta, nel PDF.

## Task atomici

```yaml
- id: T-2501
  title: "Stato di scrittura delle pagine del piano"
  macrotask: "ux-plan"
  depends_on: [T-1904, T-1906, T-1907, T-2406]

  objective: >
    Salvare per ogni pagina del piano se è da scrivere, in scrittura o pubblicata, permettere di cambiarlo e portarlo
    negli export della strategia.

  definition_of_done:
    - "Migrazione 0043_page_status: enum StrategyPageStatus (TODO, WRITING, PUBLISHED), colonna strategy_pages.status con default TODO e strategy_pages.status_changed_at nullable."
    - "PATCH /api/projects/[id]/strategies/[strategyId]/pages/[pageId] accetta status oltre a h1, h2 e contentType (T-1904): imposta status_changed_at all'istante della modifica, incrementa version come le altre modifiche e non cambia h1_edited né h2_edited."
    - "Export CSV, XLSX e Google Sheets della strategia: ultima colonna Stato con Da scrivere, In scrittura o Pubblicata nella lingua dell'utente (catalogo strategy.export, T-2102). PDF: parametro status=1 che aggiunge lo stato di ogni pagina nell'ordine di lavoro e nelle sezioni per hub; senza il parametro il PDF non cambia. Nella finestra Esporta (T-2406) l'opzione «Includi lo stato di scrittura», spenta di default, imposta status=1."
    - "tests/integration/strategy-export.test.ts aggiornato per la nuova colonna: modifica confermata in anticipo dall'utente con D-39."

  acceptance_criteria:
    - id: AC-2501-1
      given: "il DB di test migrato fino a 0043 e una pagina con h1_edited false di una strategia alla version 2"
      when: "si invia PATCH con version 2 e status WRITING, poi PATCH con version 3 e status DONE"
      then: "la prima risposta è 200, la pagina ha status WRITING, status_changed_at valorizzato, h1_edited false e la strategia è alla version 3; la seconda risposta è 400 VALIDATION_ERROR e la pagina resta WRITING"
    - id: AC-2501-2
      given: "una strategia con una pagina PUBLISHED e due pagine TODO"
      when: "si scarica l'export CSV, poi il PDF con status=1 e il PDF senza parametro"
      then: "l'ultima colonna dell'intestazione del CSV è la traduzione di Stato e la riga della pagina pubblicata contiene Pubblicata; il testo del primo PDF contiene Pubblicata, quello del secondo no"
    - id: AC-2501-3
      given: "un utente di un altro workspace"
      when: "invia PATCH con status PUBLISHED su una pagina del piano"
      then: "riceve 404 e lo stato della pagina non cambia"

  target_tests:
    - file: "tests/integration/strategy-page-status.test.ts"
      covers: [AC-2501-1, AC-2501-3]
    - file: "tests/integration/strategy-export.test.ts"
      covers: [AC-2501-2]

  security_notes:
    - "A01 / CWE-639: la pagina deve appartenere alla strategia del percorso, nel progetto del workspace dell'utente (T-1904)."
    - "A04 / CWE-362: il cambio di stato passa dal controllo della version come le altre modifiche."

  out_of_scope:
    - "Indirizzo della pagina pubblicata e controllo delle posizioni su Google."
    - "Assegnazione delle pagine ai membri del workspace e scadenze."

- id: T-2502
  title: "Un piano per progetto e «Rigenera» che non tocca le pagine iniziate"
  macrotask: "ux-plan"
  depends_on: [T-2501, T-1901, T-1903]

  objective: >
    Fare della strategia più recente il piano del progetto, rigenerarlo senza perdere il lavoro sulle pagine già
    iniziate e tenere le strategie precedenti come versioni in sola lettura.

  definition_of_done:
    - "Piano del progetto = strategia con created_at più recente. Pagine app/projects/[id]/plan/page.tsx (piano, oppure «Costruisci il piano» se non esiste), app/projects/[id]/plan/versions/page.tsx (versioni precedenti con data, modalità e numero di pagine) e app/projects/[id]/plan/versions/[strategyId]/page.tsx (versione in sola lettura, vista elenco). /projects/[id]/strategy reindirizza con 308 a /plan; /projects/[id]/strategy/[strategyId] a /plan se è il piano, altrimenti alla sua versione."
    - "POST /api/projects/[id]/strategies con regenerate true su un progetto che ha già un piano: pagine bloccate = pagine del piano con status WRITING o PUBLISHED, più gli hub che hanno almeno uno spoke bloccato (hub ancorati). La nuova strategia copia le pagine bloccate con h1, h2, flag di modifica, tipo, stato, status_changed_at e keyword; il perimetro è quello delle tenute (T-2401) meno le forme canoniche già nelle pagine bloccate; le pagine non bloccate si ricostruiscono."
    - "buildStrategyPlan accetta anchors (hub ancorati con la loro keyword principale): ogni ancora vale come seed; le keyword che formerebbero un hub con lo stesso nucleo di un'ancora vanno sotto l'hub ancorato, come nuovi spoke se raggiungono le soglie di uno spoke, altrimenti nella sua pagina pilastro se non è bloccata, altrimenti tra le non assegnate. Nessuna pagina nuova ha la stessa keyword principale di una pagina bloccata."
    - "Oltre 20 strategie nel progetto la rigenerazione elimina nella stessa transazione la versione più vecchia, mai il piano corrente (D-35 emendata: la rigenerazione non risponde più 409 STRATEGY_LIMIT)."
    - "Modifiche (PATCH delle pagine, operazioni, cambio di stato) su una strategia che non è il piano → 409 STRATEGY_READ_ONLY, nuovo codice in API_ERROR_CODES e nei cataloghi errors.* it ed en."
    - "Dialogo «Rigenera il piano»: «Riorganizzo le pagine non ancora iniziate con le keyword tenute di oggi. Le pagine in scrittura o pubblicate restano come sono.» e «Opzioni avanzate» chiuse con il perimetro e le regole della modalità esperta (components/strategy/strategy-settings.tsx)."

  acceptance_criteria:
    - id: AC-2502-1
      given: "un piano con lo spoke S in WRITING con un H1 riscritto, la pilastro P del suo hub in TODO e altre pagine TODO; poi tre keyword nuove tenute nel progetto, di cui due con il nucleo dell'hub di S e lo stesso modificatore"
      when: "si invia POST strategies con mode AUTO e regenerate true"
      then: "la nuova strategia contiene S con lo stesso H1, le stesse keyword e lo stato WRITING sotto un hub con la stessa keyword principale di P; le due keyword nuove con lo stesso modificatore formano uno spoke sotto quell'hub; nessuna keyword compare in due pagine; nessuna pagina nuova ha la keyword principale di S"
    - id: AC-2502-2
      given: "un progetto con 20 strategie, l'ultima delle quali è il piano"
      when: "si rigenera il piano"
      then: "la risposta è 201; il progetto ha ancora 20 strategie; la strategia più vecchia non esiste più e il piano precedente esiste tra le versioni"
    - id: AC-2502-3
      given: "un progetto con una versione precedente V e il piano corrente"
      when: "si invia PATCH di una pagina di V e un'operazione move_keywords su V"
      then: "entrambe le risposte sono 409 STRATEGY_READ_ONLY e V non cambia"
    - id: AC-2502-4
      given: "le richieste /projects/<id>/strategy, /projects/<id>/strategy/<piano> e /projects/<id>/strategy/<V>"
      when: "si seguono le risposte"
      then: "le tre risposte sono 308 verso /projects/<id>/plan, /projects/<id>/plan e /projects/<id>/plan/versions/<V>"

  target_tests:
    - file: "tests/integration/plan-regenerate.test.ts"
      covers: [AC-2502-1, AC-2502-2, AC-2502-3]
    - file: "tests/unit/strategy-cluster.test.ts"
      covers: [AC-2502-1]
    - file: "tests/integration/plan-redirect.test.ts"
      covers: [AC-2502-4]

  security_notes:
    - "A01 / CWE-639: rigenerazione, versioni e redirect risolvono progetto e strategia nel workspace dell'utente (T-1903)."
    - "A06 / CWE-770: restano i tetti di 5000 keyword per strategia e 20 strategie per progetto (D-35)."

  out_of_scope:
    - "Ripristino di una versione precedente come piano corrente."
    - "Confronto tra due versioni del piano."

- id: T-2503
  title: "Spostare un approfondimento sotto un'altra pagina principale"
  macrotask: "ux-plan"
  depends_on: [T-1904]

  objective: >
    Aggiungere all'editor del piano l'unica operazione che la bacheca richiede e che oggi manca: cambiare la pagina
    principale di uno spoke.

  definition_of_done:
    - "Operazione move_page { pageId, targetHubId } in lib/modules/strategy/editor.ts e in POST .../operations: pageId deve essere uno SPOKE e targetHubId un HUB della stessa strategia diverso dall'hub attuale; lo spoke va in fondo agli spoke dell'hub di destinazione; gli H2 non modificati (h2_edited false) dei due hub si ricalcolano con buildPageTitles; version e conteggi come le altre operazioni (T-1904)."
    - "pageId di un HUB, targetHubId di uno SPOKE o di un'altra strategia → 400 VALIDATION_ERROR o 404 STRATEGY_NOT_FOUND, senza modifiche."

  acceptance_criteria:
    - id: AC-2503-1
      given: "gli hub H1 con gli spoke A e B e H2 con lo spoke C, tutti con h2_edited false"
      when: "si sposta A sotto H2 con move_page"
      then: "A ha hub_page_id uguale a H2 e viene dopo C nell'ordine; gli H2 di H1 non contengono più la keyword principale di A e quelli di H2 la contengono; la version della strategia è aumentata di 1"
    - id: AC-2503-2
      given: "lo stesso piano"
      when: "si invia move_page con pageId uguale a H1, poi con targetHubId uguale a B"
      then: "entrambe le risposte sono 400 VALIDATION_ERROR e il piano non cambia"

  target_tests:
    - file: "tests/integration/strategy-operations.test.ts"
      covers: [AC-2503-1, AC-2503-2]

  security_notes:
    - "A01 / CWE-639: pagine dell'operazione verificate nella strategia del percorso (T-1904)."

  out_of_scope:
    - "Riordino manuale delle schede dentro una colonna: l'ordine resta quello di priorità."

- id: T-2504
  title: "Bacheca del piano, raggruppamento per stato e vista elenco"
  macrotask: "ux-plan"
  depends_on: [T-2502, T-2503, T-2303]

  objective: >
    Mostrare il piano come una bacheca in stile Trello compatta, con le pagine raggruppate per pagina principale o
    per stato, il trascinamento per riorganizzarle e una vista elenco alternativa.

  definition_of_done:
    - "components/plan/plan-board.tsx nella pagina /plan. Raggruppa per Gruppo (default): una colonna per hub nell'ordine di lavoro, con in cima la scheda della pagina pilastro (bordo evidenziato, etichetta Pagina principale) e sotto gli spoke in ordine di position; ultima colonna «Senza pagina» con le keyword non assegnate come chip, solo se ce ne sono. Scheda: numero nell'ordine di lavoro, tipo di contenuto, H1, numero di keyword e ricerche al mese, etichetta di stato; le pubblicate attenuate con la data."
    - "Raggruppa per Stato: colonne Da scrivere, In scrittura e Pubblicate; ogni scheda ha un'etichetta colorata con il nome della sua pagina principale (otto colori assegnati in ordine agli hub)."
    - "Trascinamento con il drag and drop nativo del browser: una scheda spoke su un'altra colonna di hub → move_page (T-2503); un chip di «Senza pagina» su una scheda → move_keywords (T-1904); con Raggruppa per Stato, una scheda su un'altra colonna → cambio di stato (T-2501). Alternativa da tastiera e da touch per ognuno: menu della scheda «Sposta sotto…», menu del chip «Assegna a…», menu dell'etichetta di stato con le tre voci. Dopo un 409 STRATEGY_CONFLICT il piano si ricarica con un messaggio."
    - "Barra dell'avanzamento sopra la bacheca: barra a segmenti e testo «N pubblicate · N in scrittura · N da scrivere». Selettori Raggruppa per (Gruppo, Stato) e vista (Bacheca, Elenco) nell'URL (group, view); sotto i 640 px vista Elenco di default e colonne della bacheca scorrevoli in orizzontale."
    - "Vista elenco: una riga per pagina raggruppata per hub con numero, H1, tipo, keyword, ricerche e stato. Le pagine e i componenti della vecchia vista della strategia (strategy-page-card.tsx, strategy-unassigned.tsx) sono rimossi; tests/e2e/strategy.spec.ts riscritto sulla nuova pagina."

  acceptance_criteria:
    - id: AC-2504-1
      given: "un utente E2E con il piano generato dalla fixture italiana di T-1901, con H hub e U keyword non assegnate (U maggiore di 0), e la viewport 1280x900"
      when: "apre /projects/<id>/plan"
      then: "la bacheca ha H+1 colonne: H colonne di hub, ciascuna con in cima la scheda Pagina principale, e la colonna Senza pagina con U chip; la barra dell'avanzamento contiene '0 pubblicate'"
    - id: AC-2504-2
      given: "lo stesso piano"
      when: "l'utente trascina il primo spoke del primo hub sulla colonna del secondo hub e ricarica la pagina"
      then: "dopo il ricaricamento la scheda è l'ultima della colonna del secondo hub"
    - id: AC-2504-3
      given: "lo stesso piano"
      when: "l'utente apre con la tastiera il menu dell'etichetta di stato di una scheda, sceglie Pubblicata e poi passa a Raggruppa per Stato"
      then: "la colonna Pubblicate contiene quella scheda; la barra dell'avanzamento contiene '1 pubblicata'"
    - id: AC-2504-4
      given: "la pagina /plan nelle due viste a 1280x900"
      when: "si esegue axe"
      then: "axe riporta 0 violazioni serious o critical in entrambe le viste"

  target_tests:
    - file: "tests/e2e/strategy.spec.ts"
      covers: [AC-2504-1, AC-2504-2, AC-2504-3, AC-2504-4]

  security_notes:
    - "A05 / CWE-79: H1, keyword e nomi resi come testo; i dati trascinati sono solo id interni, verificati dal server."

  out_of_scope:
    - "Libreria di drag and drop esterna: si usa l'API nativa del browser con le alternative da tastiera."
    - "Mappa concettuale del piano: scartata dall'utente."

- id: T-2505
  title: "Pannello di dettaglio della pagina con modifica diretta"
  macrotask: "ux-plan"
  depends_on: [T-2504]

  objective: >
    Aprire i dettagli di una pagina solo quando servono, in un pannello laterale dove si modifica scrivendo, con
    salvataggio automatico e le azioni rare in un menu.

  definition_of_done:
    - "components/plan/page-panel.tsx: pannello a destra (a tutto schermo sotto i 640 px) aperto dal clic su una scheda o su una riga: relazione (Pagina principale o Approfondimento di «H1 dell'hub»), selettore di stato, H1 in un campo con l'etichetta suggerito se h1_edited è false, H2 in un'area di testo una voce per riga con l'etichetta suggerito se h2_edited è false, tipo di contenuto, keyword (principale e secondarie con le ricerche, ognuna con «Sposta in…» e «Togli dalla pagina»), motivo tradotto e collegamenti interni."
    - "Salvataggio automatico all'uscita dal campo o dopo 800 ms senza digitare, con la version corrente; indicatore «Salvato»; dopo un 409 STRATEGY_CONFLICT il piano si ricarica e il pannello mostra «Il piano è stato modificato da un altro membro: ho caricato l'ultima versione»; un errore di validazione resta sotto il campo senza perdere il testo scritto."
    - "Menu ⋯ del pannello: Unisci a… (merge_pages), Rendila principale (promote_to_hub, solo per gli spoke), Elimina pagina (delete_page con conferma). Esc chiude il pannello e riporta il focus alla scheda. Nelle versioni precedenti il pannello è in sola lettura, senza campi né menu."

  acceptance_criteria:
    - id: AC-2505-1
      given: "il pannello di una pagina alla version 4 con risposta simulata 200 della PATCH"
      when: "l'utente cambia l'H1, aspetta 800 ms senza digitare"
      then: "parte una sola PATCH con version 4 e il nuovo h1; il pannello mostra Salvato e l'etichetta suggerito accanto all'H1 non c'è più"
    - id: AC-2505-2
      given: "lo stesso pannello con risposta simulata 409 STRATEGY_CONFLICT"
      when: "l'utente cambia l'H2 ed esce dal campo"
      then: "il pannello richiede di nuovo il piano e mostra il messaggio di piano modificato da un altro membro"
    - id: AC-2505-3
      given: "il pannello di una pagina di una versione precedente"
      when: "si rende il pannello"
      then: "non ci sono campi modificabili né il menu ⋯ e l'H1 è mostrato come testo"

  target_tests:
    - file: "tests/component/page-panel.test.tsx"
      covers: [AC-2505-1, AC-2505-2, AC-2505-3]

  security_notes:
    - "A04 / CWE-362: ogni salvataggio porta la version; il server rifiuta le modifiche su una versione superata (T-1904)."
    - "A05 / CWE-79: H1 e H2 resi come testo anche nel pannello."

  out_of_scope:
    - "Annulla e ripeti delle modifiche."

- id: T-2506
  title: "La scrittura nel percorso: tappa, prossima pagina e avanzamento nella home"
  macrotask: "ux-plan"
  depends_on: [T-2502, T-2302, T-2305]

  objective: >
    Far proseguire il percorso oltre il piano: la barra laterale mostra la tappa della scrittura, il prossimo passo
    indica la prossima pagina da scrivere e la home mostra l'avanzamento di ogni progetto.

  definition_of_done:
    - "computeProjectProgress (T-2302) riceve anche i conteggi delle pagine del piano per stato e la prima pagina TODO nell'ordine di lavoro; steps aggiunge writing ('todo', 'current', 'done' quando tutte le pagine sono PUBLISHED); next aggiunge write_next (pagine TODO presenti: «Prossima da scrivere: «H1» (n. N)» con il pulsante «Inizia a scriverla», che imposta lo stato WRITING e apre il pannello della pagina), writing (nessuna TODO e almeno una WRITING: «Hai N pagine in scrittura» con «Apri il piano») e plan_done (tutte PUBLISHED: «Piano completato» con «Aggiungi un argomento»); open_plan resta solo per un piano senza pagine."
    - "Barra laterale: tappa 3 «Scrittura» con lo stato di steps.writing e il testo «N di M pubblicate», link al piano raggruppato per stato."
    - "Scheda del progetto nella home (T-2305): con un piano, barra dell'avanzamento della scrittura e testo «Scrittura: N di M pubblicate»; il pulsante segue next."

  acceptance_criteria:
    - id: AC-2506-1
      given: "tre stati: un piano con 9 pagine di cui 1 PUBLISHED, 2 WRITING e la prima TODO alla posizione 4; un piano con 0 TODO e 2 WRITING; un piano con tutte le pagine PUBLISHED"
      when: "si chiama computeProjectProgress su ciascuno"
      then: "next vale nell'ordine write_next con la pagina della posizione 4, writing e plan_done; steps.writing vale current, current e done"
    - id: AC-2506-2
      given: "un utente E2E con il piano della fixture e nessuna pagina iniziata"
      when: "preme Inizia a scriverla nella barra del prossimo passo"
      then: "il pannello della prima pagina nell'ordine di lavoro è aperto con lo stato In scrittura; la barra laterale mostra '0 di' seguito dal numero delle pagine e 'pubblicate'; la barra in fondo propone la pagina successiva"
    - id: AC-2506-3
      given: "un progetto con un piano di 9 pagine di cui 3 PUBLISHED"
      when: "l'utente apre la home"
      then: "la scheda del progetto contiene 'Scrittura: 3 di 9 pubblicate' e una barra di avanzamento"

  target_tests:
    - file: "tests/unit/next-step.test.ts"
      covers: [AC-2506-1]
    - file: "tests/e2e/strategy.spec.ts"
      covers: [AC-2506-2]
    - file: "tests/e2e/home.spec.ts"
      covers: [AC-2506-3]

  security_notes:
    - "A01 / CWE-639: i conteggi si leggono solo per progetti già risolti nel workspace dell'utente."

  out_of_scope:
    - "Promemoria o notifiche sulle pagine da scrivere."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo 25 approvato dall'utente il 2026-10-13 («approvo», insieme ai moduli 23, 24 e 26), con le differenze dai mockup e le scelte dell'agente elencate in questo Self-check.
- Design approvato dall'utente il 2026-10-13: piano come bacheca T1 divisa per pagine principali (la mappa concettuale è stata scartata perché troppo grande), monitoraggio della scrittura di T2 come stato delle schede e raggruppamento per stato, pannello di dettaglio con modifica diretta, un solo piano per progetto con «Rigenera» che non tocca le pagine in scrittura o pubblicate e le strategie precedenti nello storico.
- Emendamenti dichiarati: D-33 (rigenerare crea ancora una strategia nuova, ma il piano del progetto è la più recente e le pagine iniziate passano nella nuova), D-35 (la rigenerazione elimina la versione più vecchia oltre 20 invece di rispondere 409). Export della strategia con la colonna Stato: aggiornamento del test confermato in anticipo con D-39.
- Gate umani: nessuna baseline visiva tocca la pagina del piano; resta il gate dei moduli 23 e 24 se l'E2E riscrive le loro baseline.
- Scelte dell'agente da confermare (rilievi): colori delle etichette per hub da una tavolozza di otto in ordine; ordine delle schede non modificabile a mano; drag and drop nativo senza librerie, con menu equivalenti da tastiera e touch.
- Note di costruzione (2026-10-14), scelte dell'agente da confermare dall'utente. T-2501: status_changed_at cambia solo quando lo stato cambia davvero; nel PDF con status=1 ogni voce dell'ordine di lavoro finisce con « · Stato» e ogni pagina delle sezioni per hub ha la riga «Stato: …»; position diventa l'indice nell'ordine di lavoro (la migrazione 0043 rinumera le strategie esistenti senza cambiare l'ordine mostrato e l'editor rinumera dopo ogni operazione), così la prossima pagina da scrivere è quella da scrivere con position più bassa. T-2502: senza piano regenerate costruisce il primo piano; la generazione senza regenerate resta com'era (409 STRATEGY_LIMIT a 20); una pilastro ancorata ancora da scrivere riceve le keyword nuove del suo nucleo e, se i suoi H2 non sono stati riscritti, li ricalcola con gli spoke nuovi; l'ordine di lavoro del piano rigenerato si ricalcola su tutte le pagine con la regola del motore; il nome del piano è nelle opzioni avanzate; il menu ⋯ del piano ha «Elimina il piano» (la versione precedente diventa il piano) e ogni versione si elimina dal suo menu; la versione che è anche il piano porta a /plan. T-2504: colonne e etichette colorate usano la keyword principale della pagina principale; «Senza pagina» c'è solo con Raggruppa per Gruppo; le chip sono pulsanti con il menu «Assegna a…»; con Raggruppa per Stato si trascina ogni scheda; senza vista nell'URL la bacheca e l'elenco sono entrambi nella pagina e il CSS mostra quella giusta sotto e sopra i 640 px. T-2505: il pannello è modale (focus trattenuto, Esc chiude), stato e tipo si salvano subito al cambio, «Togli» porta la keyword tra quelle senza pagina; useModalFocus ora fa rispondere a Esc e Tab solo l'ultima modale aperta, per i dialoghi aperti dal pannello. T-2506: «Inizia a scriverla» mette la pagina In scrittura e apre il suo pannello in /plan?page=<id>; la tappa Scrittura porta al piano raggruppato per stato e senza piano dice «dopo il piano»; la barra della scheda nella home ha anche il segmento delle pagine in scrittura.
- Rimozioni della vecchia vista (DoD di T-2504): le due pagine della strategia, strategy-page-card.tsx, strategy-unassigned.tsx, keyword-mover.tsx (usato solo da queste), lib/client/use-strategy-action.ts (sostituito da components/plan/plan-requests.tsx), il tipo «strategy» di DeleteEntityButton e le chiavi dei cataloghi rimaste senza uso (strategy.ui della vecchia pagina e strategy.delete).
- Scelte dell'agente e note di costruzione confermate dall'utente il 2026-10-14 (D-40).
