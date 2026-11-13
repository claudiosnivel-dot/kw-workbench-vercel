# Fornitori di metriche (volumi di ricerca)

L'API Google Ads non si usa per le metriche (D-09). I volumi arrivano dal file di Keyword Planner del
cliente (`docs/PLANNER-ROUNDTRIP.md`) o dal fornitore con licenza DataForSEO (D-30), dietro l'unica
interfaccia `MetricsProvider` (`lib/modules/providers/metrics/types.ts`, T-901).

## Fonti verificate il 2026-10-06

Il codice cita questo documento invece degli URL (il test di T-901 vieta il percorso del vecchio
modulo Google Ads nel sorgente).

| Fatto | Fonte |
|---|---|
| Al massimo 80 caratteri e 10 parole per keyword nel caricamento di Keyword Planner | https://support.google.com/google-ads/answer/7337243 |
| Colonne del file scaricato da Keyword Planner («Avg. monthly searches», «Competition», «Top of page bid (low range)», «Top of page bid (high range)») | https://support.google.com/google-ads/answer/3022575 |
| Colonne di Keyword Planner con Google Ads in spagnolo (verificato il 2026-10-19, T-5002): «Promedio de búsquedas mensuales», «Competitividad» (baja, media, alta), «Puja por la parte superior de la página (intervalo bajo)» e «(intervalo alto)»; le guide in spagnolo di Metricool e Ahrefs scrivono «Competencia» | https://support.google.com/google-ads/answer/3022575?hl=es |
| DataForSEO: 80 caratteri e 10 parole per keyword, al massimo 1.000 keyword e 12 richieste al minuto per account sugli endpoint live, un task per chiamata, `location_code` assente = dati mondiali; `cpc` in USD, valuta delle offerte (`low_top_of_page_bid`, `high_top_of_page_bid`) **non dichiarata** | https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/ |
| DataForSEO: simboli non validi (virgola, `!`, `@`, `%`, `^`, parentesi tonde e graffe, `=`, `;`, `~`, accento grave, `<`, `>`, `?`, barra rovesciata, barra verticale, `―`), caratteri Unicode di 4 byte non validi, regex dei simboli UTF-8 non supportati (399 intervalli, riportata intera in `dataforseo-keywords.ts`); una keyword non valida può far fallire l'intero lotto (articolo aggiornato il 18.02.2025) | https://dataforseo.com/help-center/using-symbols-in-keywords-when-setting-a-google-ads-task |
| DataForSEO: codici di stato (20000 Ok; 40202 limite al minuto superato; 40209 troppe richieste simultanee; 40100 autenticazione; 40200/40210 credito; 40501 campo non valido; 5xxxx errori del server) | https://docs.dataforseo.com/v3/appendix/errors |
| DataForSEO: elenco delle location (CSV del 2026-09-01, 96.429 righe, 244 di primo livello); senza location di primo livello AX, BY, CU, IR, KP, RU | https://cdn.dataforseo.com/v3/locations/locations_kwrd_2026_09_01.csv |
| Lingue di Google Ads (51 codici; Cinese `zh_CN`/`zh_TW`, Ebraico `iw`, Filippino `tl`) | https://developers.google.com/google-ads/api/data/tables/languagecodes.csv |

## DataForSEO (T-902, T-909, T-903)

- Credenziali solo in `DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD` (mai in DB né nei log); senza credenziali
  nessuna chiamata e `metricsNotice` `PROVIDER_NOT_CONFIGURED`. Il provider si sceglie solo come root admin
  finché T-1605 non introduce il diritto di piano.
- Lingue: l'elenco di `GET .../keywords_data/google_ads/languages` richiede le credenziali e **non è stato
  ancora scaricato**. Fino ad allora valgono i codici dell'app identici a quelli di Google Ads (46);
  `zh`, `he` e `fil` restano senza corrispondenza (`LANGUAGE_UNSUPPORTED`) finché l'elenco di DataForSEO
  non conferma il codice, insieme a `si`, `eu`, `gl`, `af`, `sw`, `am` che Google Ads non supporta.
  Da fare con le credenziali: scaricare l'elenco e aggiornare `dataforseo-targets.ts`.
- Limitatore: al massimo 12 richieste in ogni finestra di 60 secondi, contando gli invii dell'istanza e le
  righe del registro `metrics_provider_requests` (tutte le istanze). Timeout per richiesta
  `DATAFORSEO_TIMEOUT_MS`, tentativi per lotto `DATAFORSEO_MAX_ATTEMPTS`; si ripete solo su 429, 5xx,
  timeout e 40202, 40209, 5xxxx.
- Tetti di spesa: `METRICS_MONTHLY_BUDGET_USD` (mese UTC) e `METRICS_RUN_BUDGET_USD` (per estrazione),
  default 0 = nessuna spesa; ogni tentativo è prenotato con `METRICS_COST_PER_REQUEST_USD` sotto advisory
  lock e chiuso con il costo restituito. Oltre un tetto: nessuna chiamata, keyword senza volumi e
  `METRICS_BUDGET_EXCEEDED` o `RUN_BUDGET_EXCEEDED` nel job. Spesa del mese: card «Spesa fornitore
  metriche» in `/admin` e `GET /api/admin/metrics-spend` (solo root admin).
- Nel result del job: `metricsCostUsd`, `metricsRequests`, `metricsSpellCorrected`, `metricsSkipped`
  (keyword escluse prima della chiamata, per motivo).
- Richieste rifiutate (T-3903): ogni riga di `metrics_provider_requests` chiusa ha in `provider_code` il codice di
  DataForSEO dell'esito (null per un timeout o un errore di rete, e per le righe di prima della migrazione 0047; mai
  il messaggio del fornitore). Se nelle ultime 24 ore ci sono richieste DataForSEO non riuscite, la Panoramica di
  `/admin` mostra al root admin «DataForSEO ha rifiutato N richieste nelle ultime 24 ore» con il motivo dell'ultima,
  gli stessi testi del riquadro «Aggiungi i volumi» (credenziali 40100, account da verificare 40104, il codice per gli
  altri, nessuna risposta senza codice).

## Risultati di Google: SERP API di DataForSEO (T-6101, D-57)

Fatti letti nella documentazione di DataForSEO il 2026-11-13 (il design del 2026-11-12 li riportava da riverificare):

| Fatto | Fonte |
|---|---|
| `POST https://api.dataforseo.com/v3/serp/google/organic/task_post`: al massimo 100 task per chiamata (oltre: 40006), fino a 10000 chiamate al minuto; `priority` 1 normale (predefinita), 2 alta con sovrapprezzo; `depth` predefinita 10 (massimo 700), il prezzo è per pagina di 10 risultati; `language_code` e `location_code` come negli endpoint Google Ads; un task creato ha `status_code` 20100 e `result` null; `cost` della risposta e del task in USD; si paga solo l'invio del task; le keyword con operatori di ricerca (`site:`, `intitle:`) costano 5 volte | https://docs.dataforseo.com/v3/serp/google/organic/task_post/ |
| `GET .../serp/google/organic/tasks_ready`: fino a 20 chiamate al minuto, fino a 1000 task completati negli ultimi tre giorni per chiamata, ognuno nell'elenco finché non viene raccolto; senza costo; un task con `postback_url` non compare | https://docs.dataforseo.com/v3/serp/google/organic/tasks_ready/ |
| `GET .../serp/google/organic/task_get/regular/{id}`: risultati disponibili per 30 giorni, senza costo; `result[].items[]` con `type` (`organic`, `paid`, `featured_snippet`…), `rank_group`, `rank_absolute`, `url`, `domain` | https://docs.dataforseo.com/v3/serp/google/organic/task_get/regular/ |
| Codici: 20100 task creato, 40601 task ricevuto e non ancora in coda, 40602 task in coda, 40006 più di 100 task, 40209 più di 30 richieste simultanee, 40401 task inesistente, 40403 risultati scaduti (task di oltre un mese) | https://docs.dataforseo.com/v3/appendix/errors |
| Prezzo per SERP (10 risultati): coda standard 0,0006 $ (in media ~5 minuti), priority 0,0012 $ (in media fino a 1 minuto), live 0,002 $ (in media fino a 6 secondi) | https://dataforseo.com/pricing/serp/google-organic-serp-api |

Uso in Titan SEO (`lib/modules/providers/serp/dataforseo-serp.ts`, `lib/modules/plan-data/serps.ts`):

- Coda priority (`priority` 2), `depth` 10, lingua e paese della ricerca come per i volumi (`dataforseo-targets.ts`);
  lotti da 100 task, un tentativo per lotto: un lotto non riuscito lascia le sue keyword senza risultati.
- Spesa: ogni chiamata a `task_post` è una riga di `metrics_provider_requests` (fornitore DATAFORSEO, `keyword_count`
  = task del lotto), prenotata con la stima 0,0012 $ per task e chiusa con il `cost` restituito; valgono
  `METRICS_MONTHLY_BUDGET_USD` e `METRICS_RUN_BUDGET_USD` come per i volumi e la spesa compare nella card «Spesa
  fornitore metriche». Raccogliere i risultati non costa e non passa dal registro.
- Raccolta: `tasks_ready`, poi `task_get/regular` (al massimo 10 richieste in parallelo) per i soli task richiesti e
  pronti; 40601 e 40602 restano in attesa. Si salvano in `keyword_serps` solo gli URL dei risultati `organic`, al
  massimo 10 nell'ordine di `rank_absolute`: dati esterni salvati come testo, mai seguiti dal server né resi come HTML.
- Cache: i risultati di una keyword (forma canonica, lingua, paese) valgono 30 giorni (`SERP_MAX_AGE_DAYS`); entro i
  30 giorni la keyword non si invia di nuovo.
- Solo chi può usare i dati con licenza (`canUseLicensedMetrics`: root admin, o diritto `licensedMetrics` con il lancio
  attivo) fa partire richieste; gli altri ricevono `PLAN_NO_LICENSED_METRICS` senza chiamate. Senza credenziali:
  `PROVIDER_NOT_CONFIGURED`.
- Il ritmo delle raccolte (al massimo 20 `tasks_ready` al minuto) lo decide il lavoro di piano del modulo 62.
