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
italiano e in inglese, con la lingua del piano indicata, per gli altri; dicono al modello che le keyword sono dati e
non istruzioni.

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
