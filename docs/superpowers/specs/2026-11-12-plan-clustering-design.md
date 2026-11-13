# Raggruppamento del piano per intento di ricerca — design

> Brainstorming del 2026-11-12 con l'utente. Sostituisce, per il piano automatico, il raggruppamento per parole
> di partenza di D-33 (modulo 19). Da tradurre in moduli del blueprint da 2-3 task.

## Perché

L'utente ha segnalato che «se seleziono più keyword il piano non crea cluster tematici ma uno unico». Verificato
in produzione il 2026-11-12 sui suoi tre progetti:

- il motore di oggi (`lib/modules/strategy/cluster.ts`, D-33) fa un hub per ogni parola di partenza; i tre
  progetti hanno una sola seed ciascuno, quindi un solo hub;
- dentro l'hub le keyword che non formano uno spoke confluiscono nella pilastro: in «Noleggio magnetoterapia» 122
  keyword su 125 della pilastro (città come Rho, Lodi, Carpi, una keyword ciascuna), spoke senza senso come «it» e
  «san marino»; marche (Igea, Biostim, I-One), usi (ginocchio, spalla, edema osseo) e fisco (730, IVA, detraibile)
  non sono raggruppati;
- nessuna keyword ha il volume: «Aggiungi i volumi» non è mai stato premuto, quindi tutte le keyword hanno lo
  stesso punteggio e le priorità non distinguono nulla.

Nella SEO di oggi una pagina copre un **intento di ricerca**, non una keyword: le ricerche per cui Google mostra
più o meno gli stessi risultati vanno sulla stessa pagina; due pagine sullo stesso intento si cannibalizzano. Il
metodo più affidabile per capirlo è la sovrapposizione dei risultati di Google (SERP).

## Cosa vuole l'utente (sue parole e scelte)

- Il piano trova da solo i temi, anche partendo da **una sola** parola di partenza.
- Titan SEO **non deve chiedere che tipo di sito è** (attività locale o sito di contenuti): le scelte devono
  andare bene per qualunque sito.
- Accetta di **pagare qualche centesimo per piano** a DataForSEO per i risultati di Google.
- Titan SEO **prende da solo i volumi** da DataForSEO quando crea il piano; il 2026-11-13 l'utente ha precisato
  che li vuole **alla fine della ricerca**, così sceglie tieni/scarta vedendo i volumi: DataForSEO diventa il
  fornitore predefinito dei progetti nuovi per chi ha i dati con licenza, e i volumi chiesti prima del piano
  restano come rete di sicurezza (progetti esistenti, keyword importate).
- Ha approvato il flusso proposto (risultati di Google → gruppi → AI per i casi incerti → città in un'unica
  pagina → editor di sempre), con i risultati salvati per 30 giorni, il piano come lavoro in background e il
  motore di oggi come riserva.

## Obiettivi

1. **Una pagina per intento.** Le keyword che condividono abbastanza risultati di Google con la keyword di testa
   della pagina stanno nella stessa pagina.
2. **Pilastro e spoke** come oggi (stessi tipi, editor, titoli, articoli, link interni): le pagine sullo stesso
   argomento ampio formano un hub con una pilastro e i suoi spoke.
3. **Volumi sempre presenti** quando DataForSEO è disponibile: il piano li chiede da sé per le keyword tenute che
   non li hanno.
4. **Nessuna pagina per città.** Le keyword con un luogo (città, provincia, regione, quartiere, «vicino a me»)
   vanno in **un'unica pagina locale per hub** («dove noleggiare / consegna»); chi vuole una pagina per una città
   la separa nell'editor.
5. **Keyword dei concorrenti segnalate.** Una keyword che cerca un altro sito o un'altra attività (nome di dominio,
   ragione sociale, marchio di un concorrente) non entra nel piano: va tra le non assegnate con il motivo
   «concorrente». Tieni/scarta resta una scelta dell'utente (D-19): il piano non scarta nulla.
6. **Il piano esce sempre.** Se DataForSEO o l'AI non rispondono, o mancano le credenziali, o il workspace non può
   usare DataForSEO, il piano si genera con il motore di oggi e un avviso che dice perché.

## Non obiettivi

- Analisi dei contenuti dei concorrenti (testi, titoli, lunghezza delle pagine in SERP).
- Pagine per città generate in automatico.
- Prezzi e quote per i clienti del lancio commerciale (D-14 resta aperta): oggi DataForSEO lo usa solo chi ha
  diritto ai dati con licenza (vedi Vincoli).
- Rifare il piano dei progetti esistenti in automatico: l'utente rigenera quando vuole.

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- Un piano che costa più di qualche centesimo per 200 keyword (parole dell'utente: «pochi centesimi»); per il piano
  più grande (5000 keyword) l'agente fissa un tetto di circa 2 $ fra SERP e volumi (scelta dell'agente).
- Un piano che non esce o resta appeso perché un fornitore esterno non risponde.
- Una pagina per ogni città o una pagina per ogni keyword.
- Pagine che si cannibalizzano: due pagine del piano con la stessa SERP.

## Vincoli

- **Chi può usarlo (scelta dell'agente, coerente con D-30):** risultati di Google e volumi automatici solo quando il
  workspace può usare DataForSEO, con la stessa regola di `assertLicensedMetricsChoice` (root admin; con il lancio
  attivo, il diritto `licensedMetrics` del piano). Gli altri hanno il motore di oggi con l'avviso.
- **Costi (fonti lette il 2026-11-12, da riverificare e registrare in `docs/METRICS-PROVIDERS.md`):** Google Organic
  SERP API di DataForSEO 0,0006 $ a SERP con la coda standard (~5 minuti), 0,0012 $ con la priority (~1 minuto),
  0,002 $ live; una SERP = una pagina di 10 risultati. Volumi: endpoint search_volume già usato (fino a 1000
  keyword per richiesta, costo stimato `METRICS_COST_PER_REQUEST_USD`).
- **Scelte dell'agente sui costi:** coda **priority**; SERP solo per le prime **1000** keyword del perimetro per
  priorità (al massimo ~1,20 $ per piano); le altre keyword si assegnano alla pagina più vicina con il motore di
  oggi. Tutta la spesa passa dal registro e dai tetti esistenti (`metrics_provider_requests`,
  `METRICS_MONTHLY_BUDGET_USD`, `METRICS_RUN_BUDGET_USD` per lavoro di piano) e compare nella card «Spesa fornitore
  metriche».
- **Cache:** la SERP di una keyword (forma canonica, lingua, paese) vale **30 giorni**: rigenerare il piano entro
  30 giorni non la paga di nuovo. Si salvano solo gli URL dei primi 10 risultati organici (niente testi).
- **Lingue:** tutte quelle in cui il progetto può cercare; lingua e paese della SERP come quelli dei volumi
  (`dataforseo-targets.ts`). Il riconoscimento di luoghi e concorrenti è fatto dall'AI, quindi vale in ogni lingua.
- **AI:** gli stessi modelli gratuiti di titoli e articoli (impostazioni della card, `requestWithFallback`), con un
  numero di richieste per piano basso e prevedibile (a lotti, es. 300 keyword per richiesta); l'AI non decide mai i
  gruppi da sola: classifica e risolve i casi incerti, il risultato è validato (ogni keyword al più una volta,
  classi ammesse) e un errore dell'AI non blocca il piano.
- **Tempo:** il piano diventa un lavoro in background con l'avanzamento a schermo (come la ricerca delle keyword e
  gli articoli), con ripresa dal cron dei lavori fermi; la generazione sincrona di oggi resta come riserva.
- **Rigenerazione:** le pagine già iniziate (T-2502) restano bloccate e fanno da ancore come oggi.
- **Modalità esperta:** perimetro e regole di oggi restano; le regole numeriche (minimo di keyword o di ricerche per
  uno spoke, massimo di spoke per hub, domande come FAQ) si applicano alle pagine nate dalle SERP.
- **Sicurezza:** gli URL della SERP sono dati esterni: salvati come testo, mai seguiti dal server, mai resi come
  HTML; i testi delle keyword passati all'AI sono dati, non istruzioni (come nei prompt dei titoli).

## Come funziona (comportamento deciso)

1. **Avvio.** «Crea il piano» (o «Rigenera») avvia un lavoro di piano; la pagina mostra l'avanzamento per fasi.
2. **Volumi.** Per le keyword tenute del perimetro senza volume, una richiesta a DataForSEO search_volume (lotti da
   1000); i volumi si salvano sulle keyword come oggi, quindi li vedono anche la tabella delle keyword e gli export.
   Scelte dell'agente: i volumi già presenti non si richiedono di nuovo; se la richiesta fallisce o un tetto di spesa
   la blocca, il piano continua senza volumi e l'avviso dice perché (stessi testi di «Aggiungi i volumi»).
3. **Risultati di Google.** Per le prime 1000 keyword per priorità senza SERP valida in cache, task in coda priority
   e raccolta dei risultati; si salvano gli URL dei primi 10 risultati organici.
4. **Classi con l'AI.** Ogni keyword riceve una classe: luogo, concorrente o altro. Aiuti deterministici prima
   dell'AI (scelta dell'agente): «vicino a me» e le sequenze locali già riconosciute sono luogo; una keyword che
   contiene il nome di dominio del primo risultato è concorrente.
5. **Pagine.** Keyword ordinate per priorità (volume, poi punteggio come oggi); la prima non assegnata apre una
   pagina e raccoglie le keyword non assegnate che condividono almeno **3 dei primi 10 URL** con lei (soglia di
   partenza, scelta dell'agente, da rendere regola della modalità esperta). I concorrenti restano fuori; i luoghi
   vanno nella pagina locale (passo 7).
6. **Hub.** Le pagine sullo stesso argomento ampio formano un hub: la pilastro è la pagina con la keyword
   principale più ampia (meno parole di contenuto) e, a parità, più ricerche; le altre pagine diventano suoi spoke
   se ne contengono le parole di contenuto o condividono almeno 1 dei primi 10 URL con lei (soglia dell'hub, scelta
   dell'agente da rendere regola della modalità esperta); una pagina che non si lega a nessuna
   pilastro apre un hub suo. Regole numeriche della modalità esperta come oggi (pagine sotto soglia confluiscono
   nella pagina con più URL in comune, altrimenti nella pilastro).
7. **Pagina locale.** Le keyword «luogo» di un hub formano un solo spoke di tipo `local`; con le soglie della
   modalità esperta non raggiunte confluiscono nella pilastro.
8. **Keyword senza SERP** (oltre le 1000, o SERP non arrivata): vanno nella pagina più vicina secondo le parole in
   comune come fa oggi il motore; senza pagina vicina, tra le non assegnate.
9. **Fine.** Titoli dai modelli fissi come oggi, piano salvato, editor di sempre. Il piano ricorda la fonte del
   raggruppamento (risultati di Google o motore di riserva) e, se di riserva, il motivo, mostrato nell'avviso.

## Lasciato a chi costruisce

- Schema dei dati (tabella della cache delle SERP, lavoro di piano come tabella propria o come tipo di job).
- Uso di task_post/tasks_ready/task_get della coda priority, lotti e attese, rispettando i limiti di DataForSEO
  (da leggere nella documentazione e registrare in `docs/METRICS-PROVIDERS.md`).
- Prompt della classificazione e dimensione dei lotti dell'AI.
- Testi dell'avanzamento e degli avvisi nelle quattro lingue (it, en, es-ES, es-419) con le regole del linguaggio
  semplice (`tests/unit/plain-language.test.ts`).
- Divisione in moduli da 2-3 task (proposta: dati per il piano — cache SERP e volumi automatici; lavoro di piano in
  background con l'avanzamento; raggruppamento per SERP con hub, pagina locale e concorrenti).
