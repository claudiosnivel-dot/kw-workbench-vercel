# Titoli con l'AI (OpenRouter)

> D-42 emendata da D-43, moduli 35-36 del blueprint. Su richiesta, per una pagina del piano alla volta, un modello
> gratuito di OpenRouter propone H1 e H2; chi lavora al piano li accetta («Usa questi titoli») o li scarta. I titoli a
> modelli fissi di T-1902 restano il punto di partenza di ogni pagina.

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
   dell'account li esclude, OpenRouter risponde con un errore e la proposta finisce in `AI_UNAVAILABLE`. Verso
   OpenRouter partono solo le keyword della pagina, la lingua, i tipi di pagina e di contenuto e il numero massimo di
   H2 (sotto).
5. **Modello**: in Amministrazione → Impostazioni, card «Titoli con l'AI», scrivi l'ID di un modello gratuito (finisce
   con `:free`; elenco su <https://openrouter.ai/models?max_price=0>). Il default è `google/gemma-4-31b-it:free`,
   scelto il 2026-10-17 tra i modelli gratuiti disponibili quel giorno. OpenRouter toglie o cambia i modelli gratuiti
   senza preavviso: se le proposte rispondono sempre `AI_UNAVAILABLE`, prova un altro ID dall'elenco.
6. **Accensione**: nella stessa card porta l'interruttore su «Attiva» e salva. Da quel momento il pannello di ogni
   pagina del piano corrente mostra «Migliora i titoli con l'AI» a chi può modificare il piano; finché la funzione è
   spenta o la chiave manca il pulsante non c'è e la rotta risponde `AI_NOT_CONFIGURED` senza consumare i limiti.

Ogni salvataggio della card scrive nel registro dell'amministrazione una riga `ai.update` con i soli campi cambiati,
prima e dopo.

## Limiti

- **OpenRouter, piano gratuito** (pagina <https://openrouter.ai/docs/api-reference/limits>, da ricontrollare: i
  valori cambiano): per i modelli `:free` circa 20 richieste al minuto e 50 richieste al giorno per l'account senza
  crediti comprati (1000 al giorno dopo un acquisto di almeno 10 USD di crediti).
- **Tetto della piattaforma** (default 45, da 1 a 1000): proposte di tutta l'app nelle ultime 24 ore, sotto le 50
  giornaliere dell'account gratuito. Con i crediti comprati si può alzare fino a 1000 dalla card, sempre con modelli
  `:free`.
- **Limite per workspace** (default 10, da 1 a 1000): proposte di un workspace nelle ultime 24 ore, così un solo
  workspace non esaurisce il tetto della piattaforma.
- **Root admin** (D-43): escluso da entrambi i limiti; le sue proposte non entrano nel conteggio della card. Può quindi
  esaurire da solo le richieste giornaliere dell'account gratuito di OpenRouter: gli altri ricevono allora
  `AI_UNAVAILABLE` fino al giorno dopo.
- Le due finestre scorrono (le ultime 24 ore, non il giorno di calendario); ogni richiesta che parte verso OpenRouter
  resta contata anche se poi fallisce. Si controlla prima il limite del workspace e poi il tetto della piattaforma: una
  richiesta fermata dal tetto resta contata nel limite del suo workspace. La card mostra «Proposte nelle ultime 24 ore:
  N su M».

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
spoke) si tengono i primi H2 nell'ordine della risposta, senza avvisare l'utente (D-43). Nessun nuovo tentativo
automatico.

| Codice | Status | Quando |
|---|---|---|
| `AI_NOT_CONFIGURED` | 503 | funzione spenta o `OPENROUTER_API_KEY` assente |
| `RATE_LIMITED` | 429 | limite del workspace o tetto della piattaforma raggiunto, con i secondi d'attesa in `retryAfter` e nell'header `Retry-After` |
| `AI_TIMEOUT` | 504 | nessuna risposta entro 20 secondi |
| `AI_UNAVAILABLE` | 502 | OpenRouter non raggiungibile, risposta non riuscita (anche modello tolto o policy dell'account) o senza testo |
| `AI_INVALID_RESPONSE` | 502 | risposta che non supera i controlli qui sopra |

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
  la card «Proposta dell'AI» mostra H1, H2 e modello, con «Usa questi titoli» (salva H1 e H2 come una modifica a mano,
  con il controllo della versione del piano, poi scarta la proposta) e «Scarta». Con il limite raggiunto il pannello
  dice da che ora si può chiedere un'altra proposta.
- **Log**: un evento `ai_titles_suggest` per ogni richiesta partita verso il modello, con workspace, pagina, modello,
  durata ed esito; mai keyword, istruzioni, risposta del modello o chiave.
