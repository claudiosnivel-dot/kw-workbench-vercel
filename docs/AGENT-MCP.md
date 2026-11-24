# Claude Code collegato a Titan SEO (server MCP)

> D-64, D-65 e D-71, moduli 71-76 e 82-83 del blueprint; disegno in `docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`.
> Claude Code, mentre costruisce un sito, usa Titan SEO come fonte dei dati (keyword, volumi, risultati di Google, un
> piano di partenza) e come posto dove il suo lavoro resta visibile: il piano che decide e gli articoli che scrive nel
> sito. Il ragionamento SEO è di Claude Code: le AI di Titan SEO non lavorano per lui.

## Collegare Claude Code

1. **Chi**: solo il root admin. La chiave lavora con il suo account e nei suoi workspace, con i permessi di oggi.
2. **Chiave**: in Amministrazione → Impostazioni, card «Claude Code», scegli la durata (30, 60 o 90 giorni, oppure
   «Mai»; 90 giorni preselezionati) e premi «Crea la chiave». La card mostra la chiave e il comando di collegamento
   **una volta sola**: copiali subito. Titan SEO conserva solo un'impronta della chiave e il suo prefisso
   (`tsk_xxxxxxxx…`), con creazione, scadenza e ultimo uso.
3. **Comando**: nella cartella del sito, nel terminale, incolla il comando della card, che ha questa forma:

   ```
   claude mcp add --transport http titanseo https://<indirizzo di Titan SEO>/api/mcp --header "Authorization: Bearer <chiave>"
   ```

   L'indirizzo è quello di `APP_PUBLIC_URL` (in produzione quello pubblico dell'app). `claude mcp list` deve mostrare
   `titanseo` collegato; dentro Claude Code `/mcp` elenca gli strumenti. **Incollalo nel terminale, prima di avviare
   Claude Code, non nella chat**: lì la chiave resterebbe scritta nella conversazione (è successo nella prova del
   2026-11-23). La card lo ricorda sotto il comando.
4. **Chiave nuova o revoca**: «Crea una chiave nuova» revoca subito quella attiva (va ripetuto il comando con la chiave
   nuova); «Revoca» la spegne subito. Una sola chiave attiva alla volta. **Se Titan SEO era già collegato**, prima
   togli il collegamento vecchio con `claude mcp remove titanseo`, poi incolla il comando nuovo: con il nome già usato
   `claude mcp add` non lo sostituisce.

## Strumenti

Gli strumenti hanno nomi e descrizioni in inglese, perché li legge il modello; la risposta a `initialize` porta le
istruzioni di lavoro (ordine del percorso, attese, conflitti, tetto di spesa, pagine bloccate).

| Strumento | Cosa fa |
|---|---|
| `list_projects`, `get_project` | progetti dei workspace del root admin con argomenti, parole di partenza, lavori recenti e piano |
| `create_project`, `run_search` | progetto nuovo con l'avvio rapido, oppure una ricerca nuova di un argomento; rispondono subito con l'id del lavoro |
| `create_topic` | un altro argomento del progetto, in fondo all'elenco, con le sue parole di partenza e le impostazioni del progetto, e la sua ricerca; le keyword degli altri argomenti non cambiano |
| `wait_for_job` | aspetta una ricerca o un lavoro di piano fino a circa 50 s e ne dà stato e avanzamento (per una ricerca anche le domande a Google fatte e quelle tolte dal limite): si richiama finché non è finito |
| `list_keywords`, `set_keywords` | keyword con volumi, punteggi, intento e tipo; tenere o scartare fino a 1000 keyword per volta |
| `get_serps` | i primi 10 risultati di Google di fino a 50 keyword, con indirizzo, titolo e descrizione |
| `build_plan`, `get_plan` | piano costruito senza le AI di Titan SEO (solo i riconoscimenti fissi), poi letto con pagine, keyword e version, a parti di circa 1000 keyword: si richiama con `nextCursor` finché non è null |
| `edit_plan`, `update_page` | le operazioni del piano dell'app e i campi di una pagina, sempre con la version letta |
| `get_article` | l'articolo di una pagina com'è in Titan SEO, con le modifiche fatte nell'editor, la version e i controlli salvati |
| `import_article` | salva l'articolo scritto nel sito come articolo pronto della pagina e risponde con i controlli SEO e di stile |

### Ricerche e argomenti

- Una ricerca fa al massimo `MAX_EXPANSION_QUERIES` domande a Google (250 di default), divise fra le parole di
  partenza dell'argomento: ogni parola ne usa fino a 45 (la parola, 8 composizioni, 26 lettere e 10 cifre). Con 5
  parole ci stanno tutte (225); con 10 parole entrano 160 delle 260 domande con le lettere e nessuna con le cifre; con
  20 parole solo 70 delle 520 con le lettere. `wait_for_job` risponde con `queries.asked` e `queries.skipped` e, se il
  limite ne ha tolte, con una nota che consiglia `create_topic`.
- Rifare la ricerca di un argomento (`run_search`, anche con parole di partenza nuove) rifà la ricerca dell'intero
  argomento e **toglie le keyword che non ritrova**, tenute o scartate (D-19): aggiungere parole allo stesso argomento
  può far perdere keyword. Per un tema nuovo Claude Code crea un argomento con `create_topic`; le istruzioni di
  `initialize` consigliano non oltre 5 parole di partenza per argomento.
- Il piano (`build_plan`, `get_plan`) usa le keyword tenute di tutti gli argomenti del progetto.

### Articoli di Claude Code

- Claude Code scrive l'articolo nel codice del sito e importa lo stesso testo con `import_article` (Markdown, meta
  title fino a 60 caratteri, meta description fino a 155, slug). Il testo prima del primo «## » è l'introduzione, ogni
  «## » un blocco H2, la sezione con il titolo delle domande frequenti della lingua del piano («Domande frequenti»,
  «Preguntas frecuentes», altrimenti «Frequently asked questions») il blocco FAQ.
- Il testo passa dalla stessa pulizia dei blocchi scritti dalle AI: restano paragrafi, grassetto, corsivo, elenchi,
  sottotitoli H3, tabelle semplici e i link `page:` verso le pagine collegate del piano; HTML, immagini, codice, titoli
  «# » e gli altri link perdono tutto tranne il loro testo. L'H1 dell'articolo è quello della pagina nel piano.
- L'articolo è pronto (nessun lavoro di generazione, nessuna richiesta alle AI, nessun limite degli articoli), con la
  lunghezza ricavata dalle parole (Breve fino a 800, Media fino a 1500, poi Lunga) e i controlli di oggi; la pagina «Da
  scrivere» passa «In scrittura». Nell'editor e nel pannello della pagina compare «Scritto da Claude Code»; l'utente lo
  modifica e riscrive come gli altri articoli.

## Protezioni

- **Chiave**: solo `/api/mcp`, non le pagine né le altre API; a ogni richiesta si controllano chiave (esistente, non
  revocata, non scaduta) e utente (attivo, root admin, senza cambio password in sospeso); al massimo 120 richieste al
  minuto per chiave.
- **Tetto di spesa**: i lavori avviati da Claude Code (ricerche e piani) contano le richieste a pagamento di
  DataForSEO in un tetto giornaliero (giorno UTC), 2 $ di partenza, da 0 a 100 $ nella card. Raggiunto il tetto,
  `AGENT_SPEND_CAP`: Claude Code si ferma e chiede. I tetti di spesa della piattaforma restano.
- **Piano**: ogni modifica porta la version; se l'utente ha cambiato il piano, `STRATEGY_CONFLICT` con la version
  corrente. Anche il cursore di `get_plan` porta la version: se il piano cambia durante la lettura, `STRATEGY_CONFLICT`
  e Claude Code ricomincia senza cursore. Le pagine che non sono «Da scrivere» sono bloccate (`AGENT_PAGE_LOCKED`): Claude Code ne cambia solo lo
  stato e l'indirizzo pubblicato e ne importa l'articolo. Nessuna pagina si cancella dal server MCP.
- **Articoli**: `import_article` vuole sempre la version letta, 0 alla prima importazione (`get_article` senza
  articolo risponde `ARTICLE_NOT_FOUND`); se l'utente l'ha modificato nel frattempo, `ARTICLE_VERSION_CONFLICT` con la
  version corrente (0 se l'articolo non c'è ancora) e l'articolo non cambia; con un lavoro delle AI di
  Titan SEO in corso, `JOB_ALREADY_ACTIVE`. Al massimo 200 000 caratteri e 40 blocchi.
- **Registro**: ogni chiamata scrive ora, strumento, progetto, esito e durata, mai i parametri né i testi. La card
  «Claude Code» mostra le ultime 50 chiamate (con il link al progetto se esiste ancora) e la spesa di oggi con il
  tetto, per esempio «1,25 $ di 5 $ oggi».

## Prova dal computer dell'utente su un sito di prova

1. In Titan SEO, card «Claude Code»: crea una chiave da 30 giorni e lascia il tetto a 2 $.
2. Sul computer crea una cartella vuota per il sito di prova (per esempio `sito-prova`), aprila nel terminale e
   incolla il comando della card; `claude mcp list` deve mostrare `titanseo` collegato.
3. Avvia `claude` nella cartella e chiedi, per esempio: «Costruisci un sito statico di prova su un tema a scelta: usa
   Titan SEO per un progetto nuovo, la ricerca delle keyword, il piano e un articolo per la prima pagina».
4. Durante il lavoro guarda in Titan SEO: il progetto nuovo e la ricerca, il piano (avviso «preparato per Claude
   Code»), la pagina «In scrittura» con «Scritto da Claude Code» e, nella card, le chiamate e la spesa di oggi.
5. Prova le protezioni: modifica un blocco dell'articolo nell'editor e chiedi a Claude Code di reimportarlo senza
   rileggerlo (deve ricevere `ARTICLE_VERSION_CONFLICT` e rileggere con `get_article`); segna una pagina «Pubblicata» e
   chiedi di unirla a un'altra (deve ricevere `AGENT_PAGE_LOCKED`).
6. Alla fine revoca la chiave dalla card (o lasciala scadere) e, se serve, cancella il progetto di prova.
