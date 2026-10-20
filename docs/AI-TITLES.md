# Titoli con l'AI (OpenRouter)

> D-42 emendata da D-43, D-46 e D-48, moduli 35, 36 e 38 del blueprint. Su richiesta, per una pagina del piano alla
> volta, un modello gratuito di OpenRouter propone H1 e H2; chi lavora al piano li accetta («Usa questi titoli») o li
> scarta. Se un modello è occupato o risponde male si prova il successivo dell'elenco. I titoli a modelli fissi di
> T-1902 restano il punto di partenza di ogni pagina.

## Attivazione

1. **Account OpenRouter**: basta l'account gratuito; non serve comprare crediti.
2. **Chiave**: su <https://openrouter.ai/settings/keys> crea una chiave dedicata (per esempio «Titan SEO produzione»).
   Se l'account ha crediti per altri usi, puoi dare alla chiave un limite di credito pari a 0: la funzione accetta solo
   modelli `:free` e non spende comunque crediti.
3. **Vercel**: in Settings → Environment Variables aggiungi `OPENROUTER_API_KEY` per **Production** e **Preview**,
   segnata **Sensitive**, poi rifai il deploy (le variabili si leggono all'avvio della deployment). La chiave sta solo
   nell'ambiente del server: non va nel database, nelle risposte o nei log, e la card dell'amministrazione dice solo se
   c'è («Chiave configurata: sì»). `npm run env:check` sui file di `vercel env pull` dice se la variabile c'è, senza
   mostrarne il valore.
4. **Privacy dell'account OpenRouter**: su <https://openrouter.ai/settings/privacy> controlla che gli endpoint
   gratuiti siano ammessi. I fornitori dei modelli gratuiti possono conservare o usare le richieste: se la policy
   dell'account li esclude, OpenRouter risponde con un errore per ogni modello e la proposta finisce in
   `AI_UNAVAILABLE`. Verso
   OpenRouter partono solo le keyword della pagina, la lingua, i tipi di pagina e di contenuto e il numero massimo di
   H2 (sotto).
5. **Modelli**: in Amministrazione → Impostazioni, card «Titoli con l'AI», ordina da 1 a 8 modelli gratuiti (ID che
   finisce con `:free`; elenco su <https://openrouter.ai/models?max_price=0>), dal primo da provare: «Su» e «Giù»
   cambiano l'ordine, «Togli» toglie un modello, «Aggiungi modello» ne aggiunge uno scrivendo l'ID e l'elenco dei
   modelli gratuiti nuovi del catalogo ne aggiunge uno con un clic. L'elenco predefinito e la prova da cui nasce sono
   nella sezione «Modelli di riserva» qui sotto. Un valore salvato prima del modulo 38, con il solo modello, si legge
   come un elenco di un modello: le riserve si aggiungono dalla card.
6. **Accensione**: nella stessa card porta l'interruttore su «Attiva» e salva. Da quel momento il pannello di ogni
   pagina del piano corrente mostra «Migliora i titoli con l'AI» a chi può modificare il piano; finché la funzione è
   spenta o la chiave manca il pulsante non c'è e la rotta risponde `AI_NOT_CONFIGURED` senza consumare i limiti.

Ogni salvataggio della card scrive nel registro dell'amministrazione una riga `ai.update` con i soli campi cambiati,
prima e dopo (per l'elenco `models` anche quando cambia solo l'ordine).

## Modelli di riserva

- **Ordine**: una proposta prova i modelli dell'elenco dal primo. Si passa al successivo quando il fornitore è
  occupato (429 con il fornitore nei metadati dell'errore), il modello non è raggiungibile o risponde senza testo
  (errore di rete, 403, 404, 5xx), non risponde entro il suo tempo, o la risposta non supera i controlli qui sotto. Ci
  si ferma subito quando finiscono le richieste gratuite del giorno dell'account (`AI_DAILY_LIMIT`), quando l'account
  supera le richieste al minuto (`AI_BUSY`) o quando OpenRouter non accetta la chiave (401 o 402, `AI_UNAVAILABLE`).
  Nessun nuovo tentativo sullo stesso modello e nessuna attesa fra un modello e l'altro.
- **Tempi**: ogni modello ha al massimo 20 secondi e tutti i tentativi insieme 25 secondi, dentro i 30 della rotta; il
  modello successivo riceve il tempo che resta.
- **Limiti dell'account**: il 429 senza fornitore nei metadati è un limite dell'account; è il limite giornaliero se il
  messaggio lo dice (`free-models-per-day`) o se `X-RateLimit-Reset` è lontano più di due minuti, altrimenti è il
  limite al minuto. Il messaggio di OpenRouter serve solo a questa scelta e non finisce nei log.
- **Elenco predefinito**, dalla prova del 2026-10-19 con `buildTitlesRequest` e `parseTitlesResponse` dell'app su due
  pagine (uno spoke in italiano con 6 secondarie e una pilastro in inglese con 3 secondarie e 3 spoke) e sui 16 modelli
  `:free` del catalogo di quel giorno, dal migliore:

  | # | Modello | Esito della prova |
  |---|---|---|
  | 1 | `nvidia/nemotron-3-ultra-550b-a55b:free` | valida in entrambe, circa 5 s, titoli naturali in italiano e in inglese |
  | 2 | `nvidia/nemotron-3-super-120b-a12b:free` | valida in entrambe, 10-18 s, titoli naturali (il modello impostato in produzione il 2026-10-18) |
  | 3 | `poolside/laguna-xs-2.1:free` | valida in entrambe, 6-8 s, iniziali maiuscole all'inglese anche in italiano |
  | 4 | `liquid/lfm-2.5-2.6b:free` | valida in entrambe, 3-5 s, modello piccolo, titoli corretti ma più generici |
  | 5 | `google/gemma-4-31b-it:free` | 429 del fornitore (Google AI Studio) in entrambe; era il default del 2026-10-17 e resta come riserva |
  | 6 | `poolside/laguna-s-2.1:free` | valida in entrambe, 2-8 s, ma in italiano gli H2 ripetono le keyword |

  Esclusi: `nvidia/nemotron-3.5-super-vl:free`, `nvidia/nemotron-3.5-lightning:free` e
  `dots-studio/dots-3-note-preview:free` (risposta senza testo), `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
  (oltre i 20 s nella prima prova, senza testo nella seconda), `thinkingmachines/inkling:free` e
  `thinkingmachines/inkling-small:free` (403: disponibili solo per gli agenti), `xingchen-agi/xing4.0-29b-a4b:free`
  (nessuna risposta in 30 s), `google/gemma-4-26b-a4b-it:free` (429 del fornitore, lo stesso di Gemma 31B),
  `nvidia/nemotron-3.5-content-safety:free` (classificatore di sicurezza) e `cohere/north-mini-code:free` (modello per
  il codice). Restano aggiungibili dalla card.

## Catalogo di OpenRouter

- **Lettura**: `GET https://openrouter.ai/api/v1/models`, pubblico e senza chiave, con 10 secondi al massimo
  (`lib/ai/catalog.ts`). Si salvano in `app_settings` (`AI_MODEL_CATALOG`, cifrata come le altre) la data del
  controllo e i soli modelli `:free` con prezzo 0 (prompt, completion e ogni altra voce del prezzo). Una lettura non
  riuscita (rete, timeout, status non 2xx, risposta senza modelli gratuiti) lascia il catalogo salvato com'era e scrive
  nel log `ai_catalog_refresh_failed` con il solo status e il motivo. Negli E2E la stessa base `OPENROUTER_BASE_URL`
  dei completamenti porta la lettura al finto OpenRouter.
- **Quando**: ogni notte alle 04:30 UTC con il cron `/api/cron/ai-catalog` (`vercel.json`, `CRON_SECRET` come
  Authorization Bearer, come `/api/cron/reap-jobs`; sul piano Hobby l'ora può slittare fino a 59 minuti) e all'apertura
  della card se il catalogo non è mai stato letto o ha più di un'ora. Lo stesso cron, prima della lettura, elimina le
  righe del registro delle richieste più vecchie di 30 giorni (`prunedRequests` nella risposta).
- **Stato dei modelli**: nella card, accanto a ogni modello, «disponibile» (nel catalogo e gratuito), «non più nel
  catalogo» (assente o non più gratuito) o «da verificare» (catalogo mai letto), con la data dell'ultimo controllo e i
  modelli gratuiti del catalogo non ancora nell'elenco, ognuno con «Aggiungi». La proposta salta i modelli «non più nel
  catalogo» e prova quelli «da verificare». L'elenco non cambia mai da solo: aggiungere o togliere resta al root
  admin.

## Limiti

- **OpenRouter, piano gratuito** (pagina <https://openrouter.ai/docs/api-reference/limits>, da ricontrollare: i
  valori cambiano): per i modelli `:free` circa 20 richieste al minuto e 50 richieste al giorno per l'account senza
  crediti comprati (1000 al giorno dopo un acquisto di almeno 10 USD di crediti).
- **Tetto della piattaforma** (T-3901, default 900, da 1 a 5000): **richieste** a OpenRouter di tutta l'app nelle
  ultime 24 ore, cioè le righe del registro `ai_requests` (sotto), una per ogni modello provato, per i titoli e, con i
  moduli 40-46, per gli articoli. Il default sta sotto le circa 1000 richieste al giorno di un account con 10 USD di
  crediti comprati; con l'account senza crediti (50 al giorno) va abbassato dalla card. Un valore salvato prima del
  modulo 39, con il vecchio tetto in proposte (`platformDailyLimit`), vale il default; la PATCH non accetta più
  `platformDailyLimit`.
- **Limite per workspace** (default 10, da 1 a 1000): **proposte** di un workspace nelle ultime 24 ore, così un solo
  workspace non esaurisce il tetto della piattaforma; una proposta conta una volta sola anche se prova più modelli.
- **Root admin** (D-43): escluso da entrambi i limiti; le sue richieste stanno nel registro (segnate `by_root_admin`)
  ma non contano per il tetto né per «Richieste nelle ultime 24 ore» della card. Può quindi esaurire da solo le
  richieste giornaliere dell'account di OpenRouter: gli altri ricevono allora `AI_DAILY_LIMIT` fino al giorno dopo (le
  richieste gratuite si azzerano alla mezzanotte UTC) e la Panoramica mostra l'avviso del limite giornaliero.
- Le due finestre scorrono (le ultime 24 ore, non il giorno di calendario). Si controlla prima il limite del workspace
  e poi il tetto della piattaforma: una proposta fermata dal tetto resta contata nel limite del suo workspace, e il
  tetto risponde 429 `RATE_LIMITED` con i secondi finché escono dalla finestra abbastanza righe. Il controllo del
  tetto non prenota: due proposte nello stesso istante possono superarlo di qualche richiesta. La card mostra
  «Richieste nelle ultime 24 ore: N su M».

## Registro delle richieste e uso dei modelli

- **Registro** (T-3901, tabella `ai_requests`, migrazione `0047_ai_requests`): `requestWithFallback` scrive una riga
  per ogni tentativo verso un modello appena chiuso, con funzione (`titles` o `article`), modello, esito (`ok`,
  `provider_busy`, `account_daily_limit`, `account_rate_limit`, `unavailable`, `timeout`, `invalid_response`, `auth`),
  status HTTP (null senza risposta), durata della chiamata, workspace del progetto e se è il root admin. Nessuna
  colonna per testi, keyword o messaggi del fornitore. Una scrittura non riuscita non ferma la proposta e lascia nel log
  `ai_request_record_failed`. RLS abilitata senza policy: la legge solo il server. Conservazione: 30 giorni (cron del
  catalogo).
- **Uso dei modelli** (T-3902): nella card la tabella «Uso dei modelli», una per le ultime 24 ore e una per gli ultimi
  7 giorni, con ogni modello che ha righe nella settimana (anche del root admin e anche se tolto dall'elenco):
  richieste, riuscite, fornitore occupato, limite giornaliero, altri esiti e durata media delle riuscite.
- **Avvisi in Panoramica** (T-3902, solo per il root admin): «Le richieste gratuite dell'account sono finite almeno una
  volta nelle ultime 24 ore» se c'è una riga `account_daily_limit` nelle ultime 24 ore, e «Meno di 5 modelli
  disponibili per l'AI» se i modelli dell'elenco «disponibili» o «da verificare» sono meno di 5; ogni avviso porta alla
  card. Nella stessa Panoramica l'avviso delle richieste rifiutate da DataForSEO (T-3903, `docs/METRICS-PROVIDERS.md`).

## Cosa parte verso il modello

Solo: keyword principale, fino a 30 secondarie nell'ordine di priorità, per la pagina pilastro le principali dei suoi
spoke, la lingua del piano, il tipo di pagina, il tipo di contenuto e il massimo di H2 (20 per la pilastro, 12 per lo
spoke). Mai volumi, punteggi, nomi di progetto, utente o workspace. Le istruzioni sono in italiano per i piani in
italiano, in spagnolo per i piani in spagnolo e in inglese, con la lingua del piano indicata, per gli altri; dicono al
modello che le keyword sono dati e non istruzioni.

Per lo spagnolo (T-5102, D-47) le istruzioni chiedono la variante del paese della strategia, cioè della sezione del
piano se ne ha uno proprio, altrimenti del progetto: «español de España» per ES, «español de <país>» per un paese
ispanofono d'America Latina (per esempio «español de México»), «español neutro» per gli altri paesi, con il
vocabolario del mercato, «vosotros» in Spagna e «ustedes» altrove, «¿…?» nelle domande e la maiuscola solo sulla
prima parola. Il paese arriva al modello solo come nome nella variante.

## Controlli sulla risposta ed errori

La risposta vale solo se contiene un oggetto JSON `{ "h1": ..., "h2": [...] }` con un H1 che contiene tutte le parole
della keyword principale e almeno un H2, ciascun titolo entro 200 caratteri; dai titoli si tolgono `#` iniziali, tag
HTML, caratteri di controllo, spazi ripetuti e H2 doppi. Oltre il massimo della pagina (20 per la pilastro, 12 per lo
spoke) si tengono i primi H2 nell'ordine della risposta e la proposta conta quelli validi tenuti fuori (`droppedH2`):
la card dice «Altri N titoli proposti non sono stati tenuti.» (D-48). Una risposta che non supera i controlli passa al
modello successivo dell'elenco.

| Codice | Status | Quando |
|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | funzione spenta o `OPENROUTER_API_KEY` assente |
| `RATE_LIMITED` | 429 | limite del workspace o tetto della piattaforma raggiunto, con i secondi d'attesa in `retryAfter` e nell'header `Retry-After` |
| `AI_BUSY` | 503 | nessuna risposta valida con almeno un fornitore occupato, oppure l'account ha superato le richieste al minuto: «I modelli gratuiti sono tutti occupati: riprova tra qualche minuto.» |
| `AI_DAILY_LIMIT` | 429 | finite le richieste gratuite del giorno dell'account OpenRouter: «Le richieste all'AI di oggi sono finite: riprova domani.» |
| `AI_UNAVAILABLE` | 502 | nessuna risposta valida da tutto l'elenco (rete, status non riusciti, risposte senza testo, tempo scaduto o controlli non superati) oppure chiave non accettata |

`AI_TIMEOUT` e `AI_INVALID_RESPONSE` restano gli esiti di un singolo tentativo (`requestCompletion` e
`parseTitlesResponse`); la rotta, che prova tutto l'elenco, risponde con i codici della tabella.

## Nel pannello della pagina

- **Rotta**: `POST /api/projects/{id}/strategies/{strategyId}/pages/{pageId}/titles/suggest` chiede la proposta (200
  `{ data: { h1, h2, model, createdAt } }`, no-store); `DELETE` sulla stessa rotta la scarta (204, anche senza
  proposta salvata). Servono il permesso di modificare il piano del workspace del progetto; una pagina di una versione
  precedente risponde 409 `STRATEGY_READ_ONLY`.
- **Proposta conservata** (D-43): l'ultima proposta riuscita di ogni pagina resta salvata (`strategy_pages.ai_proposal`)
  finché non si usa o si scarta, anche chiudendo il pannello o ricaricando la pagina; una nuova proposta sostituisce la
  precedente, un errore la lascia com'era. H1 e H2 della pagina e la versione del piano non cambiano. La proposta
  resta anche se poi cambiano le keyword della pagina; «Rigenera» crea pagine nuove senza proposta.
- **Pannello**: «Migliora i titoli con l'AI» sotto i campi H1 e H2 («Sto scrivendo i titoli…» durante la richiesta);
  la card «Proposta dell'AI» mostra H1, H2, gli H2 tenuti fuori se ce ne sono e il modello che ha risposto, con «Usa
  questi titoli» (salva H1 e H2 come una modifica a mano,
  con il controllo della versione del piano, poi scarta la proposta) e «Scarta». Con il limite raggiunto il pannello
  dice da che ora si può chiedere un'altra proposta.
- **Log**: un evento `ai_titles_suggest` per ogni proposta partita verso OpenRouter, con workspace, pagina, modello che
  ha risposto (null se nessuno), durata, esito e `attempts`: per ogni modello provato `model`, `outcome` (ok,
  provider_busy, account_daily_limit, account_rate_limit, unavailable, timeout, invalid_response, auth) e
  `httpStatus`. Mai keyword, istruzioni, risposta o messaggi del fornitore, chiave.

## Articoli con l'AI: dati e avvio (modulo 40)

Gli articoli (D-46) usano la stessa chiave, gli stessi modelli e lo stesso tetto della piattaforma dei titoli. Il
modulo 40 prepara i dati e l'avvio; il lavoro che scrive l'articolo arriva con i moduli 41-43 e l'editor con il 44.

- **Scheda «Per gli articoli»** (T-4001): nelle impostazioni del progetto, fra i marchi dei concorrenti e le Avanzate,
  «Chi siete e cosa offrite» (fino a 1000 caratteri), «A chi vi rivolgete» (300), tono (professionale, amichevole,
  tecnico), nome (120) e indirizzo (300) dell'attività, facoltativi, e indirizzo del sito (300, solo `https`
  assoluto, senza credenziali, query o frammento, salvato senza barra finale). Si salva con la PATCH del progetto e
  con il suo Salva; senza il permesso di modificare il progetto i campi sono in sola lettura. Una riga dice che i
  testi vanno a OpenRouter con le keyword: la privacy policy (D-15) dovrà dirlo. L'app non chiama mai l'indirizzo del
  sito: serve solo a scrivere i link degli articoli.
- **Impostazioni del root admin** (T-4002): nella card, sezione «Articoli con l'AI», l'interruttore «Articoli per gli
  utenti» (spento di default: va acceso solo quando l'editor del modulo 44 è in produzione) e i limiti per workspace
  in articoli (default 3) e in sezioni riscritte (default 20) nelle ultime 24 ore, da 1 a 1000, con la riga
  `ai.update` del registro.
- **Avvio**: `POST /api/projects/{id}/strategies/{strategyId}/pages/{pageId}/article` con `{ length: SHORT | MEDIUM |
  LONG, notes? }` (note fino a 1000 caratteri). Controlli in ordine: permesso di modificare il piano e pagina del piano
  corrente (404, 409 `STRATEGY_READ_ONLY`); articoli spenti o chiave assente → 503 `AI_NOT_CONFIGURED`; lavoro già
  attivo sull'articolo → 409 `JOB_ALREADY_ACTIVE` con `runId`; tetto della piattaforma con posto per la stima
  dell'articolo (H2 della pagina più 3, più il 30%, per eccesso) e limite del workspace → 429 `RATE_LIMITED` con
  Retry-After. Il root admin è escluso dai limiti. Poi, in una transazione, l'articolo nasce o si sostituisce
  (`GENERATING`, blocchi e meta cancellati, version più 1), nasce il lavoro `pending` e la pagina passa da «Da
  scrivere» a «In scrittura»; risposta 202 `{ data: { articleId, runId } }`.
- **Lettura e annullamento**: `GET` sulla stessa rotta restituisce l'articolo con i blocchi in ordine e il lavoro
  attivo con l'avanzamento (404 `ARTICLE_NOT_FOUND` senza articolo); `DELETE .../article/run` annulla il lavoro attivo
  (200; 409 `JOB_NOT_CANCELABLE` senza lavoro attivo) e un articolo ancora in generazione diventa `FAILED` con
  `error_code` `CANCELED`.
- **«Rigenera»** (T-2502): gli articoli delle pagine copiate nel nuovo piano passano alle copie, con blocchi e lavori.
- **Tabelle**: `articles` (una per pagina), `article_sections` (blocchi con il testo in Markdown) e `article_runs`
  (lavori a passi con un solo lavoro attivo per articolo), con la RLS abilitata senza policy (migrazione 0050); la
  scheda sta in `projects` (migrazione 0049).

## Articoli con l'AI: motore e scaletta (modulo 41)

- **Motore** (T-4101, `lib/articles/run.ts`): l'avvio programma il primo passo con una POST firmata verso
  `/api/internal/article-runs/{id}/advance` (fuori dal controllo di sessione del proxy; firma HMAC di `article-run:`
  più l'id, quindi la firma di un job delle ricerche non vale: 401 `JOB_SIGNATURE_INVALID`), che risponde 202 e fa il
  passo in `after()`. Un passo prende la lease (`locked_until`) e il battito come i job, esegue le fasi finché restano
  120 s per un'altra richiesta, entro 270 s, e salva fase e avanzamento dopo ogni richiesta; poi programma il passo
  successivo. Le fasi sono `outline`, `sections` e `faq` (modulo 42) e poi `done`: un lavoro senza fasi rimaste è
  `completed` e l'articolo `READY`.
- **Richieste**: modelli delle impostazioni in ordine con le riserve (T-3802), 45 s per tentativo e 120 s per tutta la
  richiesta, una riga di `ai_requests` per tentativo con funzione `article`, il workspace del lavoro e il root admin se
  l'ha avviato lui (righe fuori dal tetto). Nel log `article_run_request` solo id, fase, modello, esito e tentativi.
- **Errori**: un errore dell'AI porta il lavoro a `failed` e l'articolo a `FAILED` con `error_code` `AI_BUSY`,
  `AI_DAILY_LIMIT`, `AI_UNAVAILABLE` (anche senza chiave) o `AI_INVALID_RESPONSE` (tutte le risposte scartate dal
  controllo); un'eccezione conta un tentativo e riprova, e al tetto `JOB_MAX_ATTEMPTS` (5) è `INTERNAL_ERROR`. Il cron
  `reap-jobs` riprende anche i lavori fermi (lease scaduta e nessun battito da `JOB_STALE_AFTER_MS`), con i conteggi
  sommati a quelli dei job. Un lavoro annullato perde la lease e il passo si ferma senza salvare.
- **Scaletta** (T-4102, `lib/articles/outline-*.ts`): istruzioni in italiano, in spagnolo con la variante del paese o
  in inglese con la lingua del piano; dati inviati: tipo di pagina e di contenuto, H1, H2 con gli id `H2_1`..., keyword
  principale e fino a 30 secondarie con il flag domanda, cosa fa l'attività, a chi si rivolge e tono della scheda, note
  dell'articolo, tetto di parole (SHORT 800, MEDIUM 1500, LONG 2500, un massimo) e pagine collegabili con un id breve
  (`L1`...) e l'H1: per uno spoke la pilastro e gli altri spoke dello stesso hub, per una pilastro i suoi spoke. Mai
  volumi, punteggi, nomi di progetto, utente o workspace, né nome, indirizzo o sito dell'attività.
- **Controllo della scaletta**: INTRO e un blocco per H2 nell'ordine del piano, cosa trattare entro 400 caratteri, solo
  keyword della pagina (ogni secondaria in un solo blocco), parole entro il tetto, link solo verso le pagine
  collegabili con quello alla pilastro per uno spoke e a ogni spoke per una pilastro, meta title (60) e meta
  description (155) con la keyword principale, da 1 a 6 immagini (oltre si tengono le prime sei). Slug, nomi dei file
  (`{slug}.webp` per la copertina, poi `{slug}-2.webp`...) e prompt delle immagini (soggetto del modello, foto
  realistica, 16:9 per la copertina e 4:3 nel testo, nessun testo nell'immagine) li calcola il codice. La scaletta
  accettata salva meta, slug, `outline` (modello e blocchi con keyword, parole e link con l'id della pagina) e `images`
  e crea i blocchi vuoti; `progress_total` diventa i blocchi più 2.

## Articoli con l'AI: scrittura dei blocchi e FAQ (modulo 42)

- **Blocchi** (T-4201, `lib/articles/section-*.ts`, `lib/articles/sections.ts`): dopo la scaletta la fase `sections`
  scrive un blocco per richiesta, introduzione e H2 nell'ordine, con il cursore `{ block: n }` salvato dopo ogni
  richiesta. Al modello vanno la pagina come nella scaletta, la scheda, le note, la scaletta intera (id, titolo e cosa
  tratta ogni blocco) e il blocco da scrivere con le sue keyword, il suo tetto di parole e le sue pagine da collegare
  (`page:L1` e l'H1). Le istruzioni, in italiano, in spagnolo con la variante del paese o in inglese con la lingua del
  piano, chiedono il tono della scheda, frasi varie e paragrafi brevi, esempi concreti, nessun riempitivo, nessuna
  delle formule tipiche dei testi generati, nessun dato inventato (segnaposto `[da verificare: …]`, `[por verificar: …]`
  o `[to verify: …]`), nessun link esterno (`[fonte da aggiungere]`, `[fuente por añadir]` o `[source to add]`) e
  Markdown semplice. Il modello risponde con il solo testo del blocco.
- **Pulizia** (`lib/articles/markdown-sanitizer.ts`): restano paragrafi, grassetto, corsivo, elenchi, sottotitoli H3 e
  i link `page:` verso le pagine del blocco, salvati con l'id della pagina del piano; si tolgono HTML (script e stili con
  il contenuto), titoli di livello 1 e 2, immagini, tabelle, codice, citazioni, link esterni e indirizzi web, lasciando
  il testo. Un blocco vuoto dopo la pulizia, o un'introduzione senza la keyword principale nelle prime 100 parole, è
  `AI_INVALID_RESPONSE` e si prova il modello successivo. Il blocco salva `body`, `model` ed `edited` false.
- **Domande frequenti** (T-4202, `lib/articles/faq*.ts`): la fase `faq` fa una richiesta con le keyword-domanda della
  pagina, le altre secondarie (fino a 30 ciascuna), la scaletta, la scheda e le note; la risposta JSON deve avere da 3
  a 6 coppie, domande entro 150 caratteri con il punto interrogativo e risposte da 20 a 120 parole pulite come i blocchi
  (senza link). Il blocco `FAQ` va in fondo con il titolo «Domande frequenti», «Preguntas frecuentes» o «Frequently asked
  questions» e ogni domanda in grassetto seguita dalla risposta.
- **Riscrittura di un blocco** (scope `SECTION`, la crea il modulo 44): il lavoro nasce nella fase `sections` con il
  blocco e l'istruzione dell'autore, che va tra i dati; `sections` riscrive un'introduzione o un H2, `faq` il blocco FAQ,
  e il blocco torna `edited` false. Un articolo intero fa una richiesta per la scaletta, una per blocco e una per le FAQ,
  più al massimo una riscrittura per blocco dai controlli (modulo 43).

## Articoli con l'AI: controlli e riscrittura (modulo 43)

Il verdetto sul testo è di due controlli deterministici, mai del modello.

- **Tratti AI e dati da verificare** (T-4301, `lib/articles/style-check.ts`): `analyzeStyle(markdown, language)`
  restituisce le corrispondenze `{ kind, rule, start, end }` (posizioni nel Markdown del blocco, per l'editor), le
  parole, `score` (tratti AI ogni 300 parole) e `overLimit`. `ai_pattern`: le formule tipiche di italiano, inglese e
  spagnolo (`phrase`, elenco versionato con `STYLE_RULES_VERSION`) e, per ogni lingua, trattini lunghi (`em_dash`),
  emoji, più di 2 domande di fila (`rhetorical_questions`) e più di 2 frasi di fila con la stessa parola iniziale
  (`repeated_openings`). `to_verify`: i segnaposto delle tre lingue, i riferimenti normativi con il numero (`law`),
  gli importi con €, EUR o USD, le percentuali, gli anni e le cifre di 3 o più caratteri, ognuno contato una volta. La
  soglia è superata con almeno 2 tratti AI ogni 300 parole, mai meno di 2; i dati da verificare non contano.
- **SEO** (T-4302, `lib/articles/seo-check.ts`): una keyword compare quando il testo ha, una dopo l'altra, le sue
  parole nella forma canonica di T-702 senza parole vuote e ridotte alla radice, in qualunque ordine e anche al plurale.
  Per l'articolo: keyword principale nell'H1, nelle prime 100 parole, nel meta title e nella meta description, meta
  title fino a 60 e meta description fino a 155 caratteri, densità della keyword principale (almeno 2 occorrenze e più
  di 2,5 ogni 100 parole è troppo). Per ogni blocco: le keyword assegnate dalla scaletta, la densità e i link
  obbligatori (la pilastro per uno spoke, ogni spoke per una pilastro) che la scaletta gli ha assegnato.
- **Fase `checks`** (`lib/articles/checks.ts`), dopo `faq`: un blocco per volta con il cursore `{ block: n }`. Un
  blocco con la soglia dei tratti AI superata, una keyword assegnata assente, la densità oltre il limite o un link
  obbligatorio mancante si riscrive una volta con la richiesta della sua fase (blocchi o FAQ) più `problems`, l'elenco
  dei problemi trovati; un blocco `edited` true non si riscrive, e una riscrittura non riuscita lascia la prima
  stesura. Il blocco salva `checks` (analisi, problemi SEO e se è stato riscritto); dopo l'ultimo l'articolo salva
  `seo_report` con la densità, i problemi dell'articolo e i blocchi con i problemi rimasti (`ai_patterns` per la
  soglia ancora superata). Con lo scope `SECTION` si controlla solo il blocco del lavoro e il rapporto si ricalcola
  sull'intero articolo. Al massimo una riscrittura per blocco e per lavoro (CWE-770).
