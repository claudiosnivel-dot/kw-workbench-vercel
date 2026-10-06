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
