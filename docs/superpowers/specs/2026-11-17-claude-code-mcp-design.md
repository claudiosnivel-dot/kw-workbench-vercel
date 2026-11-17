# Claude Code al lavoro su Titan SEO (server MCP) — disegno

> Stato: bozza da approvare. Conversazione con l'utente del 2026-11-17. Le scelte dell'utente sono segnate come sue;
> le altre sono scelte dell'agente (in fondo l'elenco da rileggere).

## Intento

L'utente costruisce siti con Claude Code. A un certo punto della conversazione vuole dire «bene, ora usiamo Titan SEO
per la ricerca delle keyword, costruisci il piano editoriale e generiamo gli articoli» e lasciare che sia Claude Code
a fare tutto, senza aprire l'app. Titan SEO resta la fonte dei dati (keyword, volumi, risultati di Google, piano di
partenza) e il posto dove si vede il lavoro; il ragionamento SEO (accorpare le keyword, scegliere H1 e H2, decidere
cosa fare di angoli e città, scrivere gli articoli) lo fa Claude Code, non le AI gratuite di Titan SEO. Gli articoli
finiscono come file nel codice del sito e, uguali, in Titan SEO.

Per ora la funzione è solo del root admin (l'utente).

## Obiettivi

1. Claude Code si collega a Titan SEO come server MCP remoto (`/api/mcp`) con una chiave personale del root admin.
2. Claude Code fa da solo l'intero percorso (scelte dell'utente):
   - crea il progetto con nome, lingua, paese e parole di partenza ricavate dal sito, e avvia la ricerca;
   - legge le keyword con tutti i dati (volumi, punteggi, intenti, tenute e scartate) e i risultati di Google (primi
     10 con indirizzo, titolo e descrizione), tiene o scarta keyword;
   - costruisce il piano senza le fasi AI di Titan SEO, lo legge e lo modifica con le operazioni del piano di oggi;
   - aggiorna le pagine (H1, H2, tipo, stato, indirizzo pubblicato);
   - importa in Titan SEO l'articolo che ha scritto nel sito e riceve i controlli SEO di Titan SEO.
3. In Titan SEO l'utente vede tutto: progetto, keyword, piano modificato, articoli, stati, e cosa ha fatto Claude Code.
4. Claude Code lancia in autonomia anche le operazioni che spendono su DataForSEO (scelta dell'utente), dentro le
   protezioni descritte sotto.

## Non obiettivi

- Utenti diversi dal root admin, workspace di squadra con più chiavi, piani a pagamento: dopo, se serve.
- Usare le AI di Titan SEO dal server MCP (titoli, consigli sugli angoli, articoli, riscrittura dei blocchi).
- Pubblicare su WordPress dal server MCP: gli articoli vanno nel sito che Claude Code costruisce.
- Funzioni di amministrazione dal server MCP (utenti, abbonamenti, modelli AI, impostazioni).
- Eliminare progetti, piani o articoli dal server MCP.
- Un'API REST pubblica documentata per terzi.

## Anti-obiettivi (cosa renderebbe il lavoro un fallimento anche se funziona)

Discussi con l'utente, che li vuole evitati tutti con le soluzioni qui sotto:

1. Spesa DataForSEO fuori controllo per un giro ripetuto di Claude Code.
2. Lavoro già scritto o pubblicato rovinato da Claude Code.
3. Una chiave rubata che permette di fare tutto come root admin.
4. Non capire in Titan SEO cosa ha fatto Claude Code.
5. Articolo nel sito e articolo in Titan SEO che divergono senza che nessuno se ne accorga.
6. Claude Code bloccato o in errore perché ricerca e piano durano minuti.

## Vincoli

- Stack di oggi: Next.js 16 (rotte in `app/api`, `proxy.ts`), Prisma su Postgres Supabase, Vercel fra1 con
  `maxDuration` 300 s, lavori in background già esistenti (estrazione, lavoro di piano) che avanzano da soli.
- `master` è accoppiato al deploy di produzione; migrazioni solo additive.
- Moduli del blueprint piccoli (2-3 task), un macrotask per sessione, oracoli di Trueline al confine.
- Dipendenze controllate stretto (versioni esatte, audit senza eccezioni): niente librerie nuove se non servono.
- Ogni testo per l'utente nei cataloghi it, en, es-ES (es-419 se diverso).
- Il proxy oggi blocca ogni `/api` senza cookie di sessione: `/api/mcp` va aggiunta ai percorsi pubblici e si
  autentica da sola.

## Come funziona

### Collegamento

- Rotta `POST /api/mcp` (runtime nodejs): protocollo MCP «Streamable HTTP» senza stato, risposte JSON (nessuno stream
  SSE, nessuna sessione): `initialize`, `notifications/initialized` (202 senza corpo), `ping`, `tools/list`,
  `tools/call`. `GET` e `DELETE` rispondono 405. Messaggi JSON-RPC 2.0; un errore di protocollo è un errore JSON-RPC,
  un errore di uno strumento è un risultato con `isError: true` e un testo con codice e spiegazione. Scritto nel
  repo senza dipendenze nuove (scelta dell'agente): il protocollo che serve è piccolo e così resta sotto i nostri
  test e oracoli.
- La risposta a `initialize` porta le **istruzioni di lavoro** per Claude Code: ordine del percorso, regola «non usare
  le AI di Titan SEO: il ragionamento è tuo», come aspettare i lavori, cosa fare con i conflitti di versione, il tetto
  di spesa e le pagine bloccate.
- Nel sito l'utente collega Claude Code con il comando che la card admin prepara:
  `claude mcp add --transport http titanseo https://titanseo.vercel.app/api/mcp --header "Authorization: Bearer <chiave>"`.

### Chiave (anti-obiettivo 3)

- Card «Claude Code» nelle impostazioni admin (`/admin/settings`), solo per il root admin.
- «Crea la chiave» con la **durata scelta dall'utente: 30 giorni, 60 giorni, 90 giorni o Mai** (scelta dell'utente).
- Una sola chiave attiva: crearne una nuova revoca la precedente. La chiave si vede in chiaro una volta sola, insieme
  al comando `claude mcp add`; Titan SEO ne salva solo l'impronta (hash) e un prefisso per riconoscerla. «Revoca» la
  spegne subito. La card mostra creazione, scadenza (o «Mai»), ultimo uso.
- A ogni richiesta: chiave esistente, non revocata, non scaduta; utente ACTIVE, ADMIN e root admin, senza cambio
  password in sospeso; limite di richieste al minuto con il limitatore di oggi (`RateLimitHit`). La chiave apre solo
  `/api/mcp`: non vale per le pagine dell'app né per le altre API.
- Gli strumenti lavorano nei workspace del root admin con i permessi di oggi (`requireProjectAccess`,
  `requireProjectScope`); i progetti nuovi nascono nel workspace personale salvo un workspace indicato fra i suoi.

### Registro (anti-obiettivo 4)

- Ogni `tools/call` scrive una riga: ora, strumento, progetto (se c'è), esito (ok o codice d'errore), durata, chiave.
  Mai i parametri completi né testi degli articoli.
- La card admin mostra le ultime 50 righe e la spesa DataForSEO di oggi di Claude Code.
- Gli articoli importati risultano «Scritto da Claude Code» nell'editor e nella lista delle pagine.

### Tetto di spesa (anti-obiettivo 1)

- I lavori avviati dal server MCP (estrazione, lavoro di piano) sono segnati come «di Claude Code».
- Tetto giornaliero in dollari solo per i lavori di Claude Code, sulle stime di costo che Titan SEO già registra per
  DataForSEO (`metrics_provider_requests.estimated_cost_usd`, volumi e risultati di Google); valore nella card admin,
  5 $ di partenza (scelta dell'agente), giorno di calendario UTC.
- Prima di avviare un lavoro che spende, lo strumento controlla il tetto: superato, risponde con un errore che dice di
  fermarsi e chiedere il via all'utente (che può alzare il tetto dalla card). Ogni risposta degli strumenti che
  spendono riporta la spesa di oggi e il tetto. Restano i tetti di spesa e il limite di un lavoro attivo per sezione
  di oggi.

### Attese (anti-obiettivo 6)

- Gli strumenti che avviano un lavoro rispondono subito con l'id.
- `wait_for_job` (estrazione o lavoro di piano) aspetta lato server fino a circa 50 s, rileggendo lo stato, e risponde
  con stato, fase e avanzamento; le istruzioni dicono di richiamarlo finché il lavoro non è finito. Nessuna richiesta
  supera la `maxDuration` della rotta.

### Piano senza AI di Titan SEO (scelta dell'utente)

- Un lavoro di piano avviato da Claude Code salta la classificazione AI (restano i riconoscimenti fissi di oggi:
  modificatori locali, nome del dominio nei risultati) e la fase dei consigli sugli angoli.
- Nel piano l'avviso del raggruppamento dice che il piano è stato preparato per Claude Code (codice nuovo, non quello
  di «AI non attiva», che sarebbe falso).

### Protezioni sul piano (anti-obiettivo 2)

- Dal server MCP: niente `delete_page`; `merge_pages`, `move_keywords` e `create_page` rifiutati se toccano una
  pagina che non è «Da scrivere» (come sorgente o come pagina da cui escono keyword); errore con un codice proprio.
- Su una pagina non «Da scrivere» Claude Code può solo cambiare lo stato, impostare l'indirizzo pubblicato e
  importare l'articolo; H1, H2 e tipo no.
- «Rigenera il piano» resta permesso: blocca già le pagine iniziate e conserva le versioni precedenti.
- Ogni modifica porta la version del piano come oggi (409 STRATEGY_CONFLICT se l'utente ha cambiato il piano nel
  frattempo: Claude Code rilegge e decide).

### Articoli (anti-obiettivo 5)

- `import_article`: Markdown dell'articolo (introduzione, H2, FAQ facoltative), meta title, meta description, slug.
  Titan SEO lo divide nei blocchi di oggi (INTRO, H2, FAQ), lo ripulisce con il sanitizer di oggi, lo salva pronto
  (READY) senza passare dall'AI né dal contatore dell'AI, segna la sorgente «Claude Code» e fa girare i controlli SEO e
  di stile di oggi, che tornano nella risposta.
- Versione dell'articolo come per il piano: la prima importazione senza versione, le successive con la versione letta
  da Claude Code; se l'utente l'ha modificato in Titan SEO nel frattempo la risposta è un conflitto con la versione
  corrente, e Claude Code rilegge l'articolo con `get_article` e decide come unire. Mai sovrascrittura alla cieca.
- Importare su una pagina «Da scrivere» la porta «In scrittura» (scelta dell'agente); «Pubblicata» la decide Claude
  Code con l'indirizzo.

### Risultati di Google completi (scelta dell'utente: «quadro completo»)

- `keyword_serps` salva anche titolo e descrizione di ogni risultato, già presenti nella risposta di DataForSEO
  (colonna additiva). Le righe vecchie restano con i soli indirizzi finché non si rinnovano dopo i 30 giorni della
  cache; lo strumento lo dice.

### Strumenti (bozza; nomi in inglese, scelta dell'agente)

| Strumento | Cosa fa |
|---|---|
| `list_projects` | progetti dei workspace del root admin, con lingua, paese, argomenti, piano sì/no |
| `get_project` | dettaglio: argomenti, parole di partenza, lavori recenti, piano corrente |
| `create_project` | crea progetto, primo argomento e parole di partenza e avvia la ricerca (avvio rapido di oggi); risponde con id del progetto e del lavoro |
| `run_search` | rilancia la ricerca di un argomento (anche con parole nuove) |
| `wait_for_job` | aspetta un lavoro (estrazione o piano) fino a ~50 s e ne dà stato e avanzamento |
| `list_keywords` | keyword di un progetto o argomento a pagine, con volumi, punteggi, intenti, tipo, tenuta/scartata, filtri di oggi |
| `set_keywords` | tieni o scarta keyword per id (azione in blocco di oggi, al massimo 1000) |
| `get_serps` | primi 10 risultati di Google per keyword (indirizzo, titolo, descrizione, data) |
| `build_plan` | costruisci o rigenera il piano senza AI; risponde con l'id del lavoro |
| `get_plan` | piano corrente: pagine, H1, H2, tipo, stato, keyword con dati, angoli, città, non assegnate, version |
| `edit_plan` | una operazione del piano di oggi con la version, con le protezioni sopra |
| `update_page` | H1, H2, tipo, stato, indirizzo pubblicato di una pagina, con le protezioni sopra |
| `import_article` | salva l'articolo scritto da Claude Code e risponde con i controlli SEO |
| `get_article` | articolo della pagina con blocchi, versione, sorgente e controlli |

Le risposte sono compatte e a pagine, per restare sotto il limite di output degli strumenti di Claude Code (circa
25 000 token).

## Moduli proposti (da scrivere nel blueprint dopo l'approvazione)

Numeri indicativi, 2-3 task ciascuno:

1. **mcp-keys**: chiave con durata, card admin con crea/revoca/ultimo uso e comando di collegamento.
2. **mcp-server**: rotta `/api/mcp` con protocollo, autorizzazione, limite di richieste, registro, istruzioni, e
   `list_projects` / `get_project`.
3. **mcp-research**: `create_project`, `run_search`, `wait_for_job`, `list_keywords`, `set_keywords`, lavori segnati
   «di Claude Code» e tetto di spesa giornaliero.
4. **mcp-serp**: titolo e descrizione nei risultati di Google salvati e `get_serps`.
5. **mcp-plan**: `build_plan` senza AI con il suo avviso, `get_plan`, `edit_plan`, `update_page` con le protezioni.
6. **mcp-articles**: `import_article` e `get_article`, sorgente «Claude Code», versione e conflitti, registro e spesa
   nella card.

Dopo l'ultimo: prova vera dal computer dell'utente, con Claude Code collegato a produzione su un sito di prova.

## Lasciato a chi costruisce

Formato della chiave, tabelle e colonne esatte, limite di richieste al minuto, conservazione del registro, dimensione
delle pagine di `list_keywords`, testo delle istruzioni, divisione del Markdown nei blocchi e scelta della lunghezza
dell'articolo dal numero di parole, codici d'errore nuovi (nei cataloghi e in `API_ERROR_CODES`), testi della card.
In più, punti da risolvere nel blueprint senza cambiare cosa si costruisce:

- Come legare alla spesa di Claude Code anche le richieste a DataForSEO del lavoro di piano (oggi una richiesta ha
  solo `project_id` e `job_id`).
- Lingua dei messaggi d'errore degli strumenti: quella delle preferenze del root admin.
- Lingua e paese di `create_project`: dati da Claude Code, validati con le liste di oggi; l'avvio rapido di oggi li
  ricava dal workspace e va adattato.
- `import_article` rifiutato mentre un lavoro dell'AI di Titan SEO su quell'articolo è in corso.
- La chiave si legge solo dall'intestazione `Authorization`, mai dall'indirizzo.

## Scelte dell'agente da rileggere

- Server MCP scritto nel repo, senza la libreria ufficiale.
- Nomi e descrizioni degli strumenti in inglese (li legge il modello); testi per l'utente nei cataloghi.
- Tetto di spesa di partenza 5 $ al giorno, giorno UTC, solo sui lavori di Claude Code.
- Progetti nuovi nel workspace personale salvo un altro workspace del root admin indicato.
- `wait_for_job` fino a circa 50 s per chiamata.
- Avviso nuovo nel piano preparato per Claude Code invece di quello di «AI non attiva».
- Importare un articolo su una pagina «Da scrivere» la porta «In scrittura».
- Registro senza parametri completi né testi; ultime 50 righe nella card.
- Sei moduli piccoli nell'ordine sopra.
