# 11-cleanup — Macrotask `cleanup`

> Rimozione del codice morto, consolidamento dei duplicati, schema e indici, accessibilità di base e costo per richiesta: nasce dall'elenco knip di T-108 e dai rilievi dell'audit 2026-10-02 su route senza chiamanti, export inutilizzati, duplicazioni e indici. Ogni rimozione è human-gated (L-COL-021).

## Obiettivo del macrotask

Ridurre la superficie del codice e del database a ciò che l'app usa davvero, senza cambiare il comportamento
osservabile coperto dalla rete di caratterizzazione (T-104..T-107): togliere route ed export senza chiamanti
(previa approvazione umana di ciascun elemento), consolidare le copie di helper e componenti, allineare
schema e indici all'ordinamento dei risultati, portare a zero le violazioni di accessibilità gravi sulle
pagine principali ed eliminare le query ripetute a ogni richiesta (utente, branding, bootstrap, totali admin).

## Inventario del codice morto verificato (git grep, 2026-10-02)

Comandi eseguiti dalla radice del repo, esclusi `package-lock.json` e `docs/`. T-1101 li riesegue al momento
del task: un elemento che nel frattempo ha acquisito chiamanti esce dalla proposta.

| R | Elemento | Verifica | Esito |
|---|---|---|---|
| R1 | `GET` in `app/api/projects/route.ts` | `git grep -n -A3 "fetch(" -- components app lib` | solo `POST` da `onboarding-project-create-form.tsx` e `project-form.tsx` |
| R2 | `GET` in `app/api/projects/[id]/route.ts` | idem | solo `PATCH` (`project-form.tsx`, `onboarding-project-targeting-form.tsx`) e `DELETE` (`delete-project-button.tsx`) |
| R3 | `GET` in `app/api/projects/[id]/subprojects/route.ts` | idem | solo `POST` (`onboarding-section-create-form.tsx`, `subproject-form.tsx`) |
| R4 | `GET` in `app/api/projects/[id]/subprojects/[subprojectId]/route.ts` | idem | solo `PATCH` (`subproject-form.tsx`, `onboarding-seeds-form.tsx`) e `DELETE` (`delete-subproject-button.tsx`) |
| R5 | `GET` in `app/api/projects/[id]/results/route.ts` (paginazione propria) | idem | solo `PATCH` da `results-table.tsx`; se T-801 l'ha già rimosso l'elemento è chiuso |
| R6 | `app/api/auth/session/route.ts` + voce `/api/auth/session` in `PUBLIC_PATHS` (oggi `middleware.ts`, `proxy.ts` dopo T-404) | `git grep -n "api/auth/session"` | unica occorrenza: `PUBLIC_PATHS` |
| R7 | `GET` in `app/api/auth/config/route.ts` + `getAuthConfigSnapshot` + tipo `AuthConfigSnapshot` (`lib/auth/credentials.ts`) | `git grep -n "api/auth/config"`; `git grep -n "getAuthConfigSnapshot"` | `auth-settings-card.tsx` usa solo `PATCH`; `getAuthConfigSnapshot` usato solo dal `GET` |
| R8 | `app/settings/page.tsx`, `app/settings/integrations/page.tsx` (redirect stub) | `git grep -n -E "settings/integrations\|href=\"/settings\"\|\"/settings\""` | 0 link |
| R9 | `LEGACY_KEYS` + `getLegacyAuthValues` in `lib/auth/credentials.ts` | `git grep -n "APP_AUTH_PASSWORD_HASH"` | nessuno scrive le chiavi `app_settings` `APP_AUTH_USERNAME`/`APP_AUTH_PASSWORD_HASH` (l'env `APP_AUTH_USERNAME` letta da `lib/auth/config.ts` è un'altra cosa e resta) |
| R10 | Provider da file `GOOGLE_ADS_METRICS_FILE` (`loadImportedMetrics`, `mergeImportedMetrics` in `google-keyword-planner.ts`) + riga in `.env.example` | `git grep -n "GOOGLE_ADS_METRICS_FILE"` | **rimosso da T-901** (macrotask 09, che precede questo) insieme all'intero `google-keyword-planner.ts`: qui si verifica solo l'assenza (0 risultati); se compare ancora, si segnala e si completa T-901, non si rimuove qui |
| R11 | `DEFAULT_METRICS_PROVIDER` in `.env.example` | `git grep -n "DEFAULT_METRICS_PROVIDER"` | solo `.env.example:52`, mai letta |
| R12 | `runQueuedExtractionJobs`, `getJobStats` (+ import `JobStatus`) in `lib/modules/jobs/job-runner.ts` | `git grep -n -E "runQueuedExtractionJobs\|getJobStats"` | solo le definizioni |
| R13 | parametro `isRootAdmin` di `updateUserAdminFields` (`lib/auth/credentials.ts`) | `git grep -n "updateUserAdminFields"` | unico chiamante `lib/admin/users.ts` passa solo role, status, password |
| R14 | `getSettingValue` in `lib/integrations/app-settings.ts` | `git grep -n -w "getSettingValue"` | solo la definizione |
| R15 | `export` di `repairCommonMojibake` (`lib/text/encoding.ts`) | `git grep -n "repairCommonMojibake"` | usata solo da `normalizeDisplayText` nello stesso file: si toglie `export`, la funzione resta |
| R16 | `requireAdminUserFromCookies`, `requireRootAdminUserFromCookies` (`lib/auth/current-user.ts`) | `git grep -n -E "requireAdminUserFromCookies\|requireRootAdminUserFromCookies"` | usate solo l'una dall'altra: si rimuovono entrambe |
| R17 | `export` di `isRootAdminUser` (`lib/auth/current-user.ts`) | `git grep -n "isRootAdminUser"` | usata solo nello stesso file: si toglie `export` |
| R18 | re-export `SESSION_COOKIE_NAME` in `lib/auth/session.ts` | `git grep -n "SESSION_COOKIE_NAME"` | tutti gli import puntano a `lib/auth/config.ts` |
| R19 | parametro `hasExport` di `resolveRecommendedStep` (`lib/onboarding/progress.ts`) | `git grep -n "hasExport"` | passato e mai letto |
| R20 | `entryMode` nel payload di `PATCH /api/onboarding/state` | `git grep -n "entryMode" -- components` | nessun client lo invia (lo stato `entryMode` letto dalle pagine resta) |
| R21 | campo `id` di `AutocompleteProviderClient` (+ `readonly id` in `google-direct.ts` e `mock.ts`) | `git grep -n -E "autocomplete\.id\|readonly id"` | mai letto (diverso dal campo `id` dei provider metriche, usato) |
| R22 | ramo `buildMissingMetrics([], ...)` in `lib/modules/pipeline/extraction.ts` | lettura del codice | equivale a una mappa vuota: sostituito da `new Map()` (guard sulle keyword vuote mantenuto), tolti import e cast |
| — | `components/set-default-section-button.tsx` | baseline knip di T-108 | **escluso**: collegato da T-802 (D-21) |
| — | `parseBoolean`, `toNumber` in `lib/utils.ts` | `git grep -n -E "parseBoolean\|toNumber\("` | **esclusi**: senza chiamanti, ma `results-filters.ts` e `project-settings.ts` ne hanno copie locali; T-1102 li rende i chiamanti |

## Task atomici

```yaml
- id: T-1101
  title: "Rimozione del codice morto confermato"
  macrotask: "cleanup"
  depends_on: [T-108, T-802, T-501]

  objective: >
    Rimuovere gli elementi R1..R22 dell'inventario, ciascuno solo dopo che l'umano ha approvato la proposta
    che ne mostra la verifica di assenza di chiamanti (L-COL-021), lasciando build, lint, typecheck e test
    verdi e riducendo di conseguenza la baseline knip di T-108.

  definition_of_done:
    - "Proposta di rimozione con gli elementi R1..R22: per ciascuno il comando git grep dell'inventario rieseguito al momento del task con il suo output; l'umano approva o scarta ogni elemento e l'esito per elemento è registrato in SESSION-STATE prima del commit"
    - "Un elemento che al momento del task ha chiamanti (anche nuovi, introdotti da task precedenti) viene escluso e annotato, mai rimosso forzando i chiamanti"
    - "R1-R5: rimossi solo gli handler GET; POST, PATCH e DELETE degli stessi file restano invariati"
    - "R6: rimossi app/api/auth/session/route.ts e la voce '/api/auth/session' da PUBLIC_PATHS del proxy; R7: rimossi l'handler GET di app/api/auth/config/route.ts, getAuthConfigSnapshot e AuthConfigSnapshot, PATCH invariato"
    - "R8: rimossi app/settings/page.tsx e app/settings/integrations/page.tsx (le URL rispondono 404 con la pagina not-found di Next, quella personalizzata se T-502 è già fatto)"
    - "R9 e R11: rimossi LEGACY_KEYS e getLegacyAuthValues (il bootstrap usa solo l'env) e la riga DEFAULT_METRICS_PROVIDER da .env.example; R10: provider da file GOOGLE_ADS_METRICS_FILE rimosso da T-901, qui solo verificata l'assenza (git grep vuoto)"
    - "R12-R14: rimossi runQueuedExtractionJobs e getJobStats, il parametro isRootAdmin di updateUserAdminFields, getSettingValue"
    - "R15-R18: tolto export a repairCommonMojibake e isRootAdminUser, rimossi requireAdminUserFromCookies e requireRootAdminUserFromCookies e il re-export SESSION_COOKIE_NAME di lib/auth/session.ts"
    - "R19-R22: rimossi il parametro hasExport, entryMode dal payload di PATCH /api/onboarding/state (campo ignorato o 400, deciso nel task in coerenza con T-1003), il campo id di AutocompleteProviderClient e delle sue implementazioni, il ramo buildMissingMetrics([]) sostituito da new Map()"
    - "Esclusi per scelta e annotati nella proposta: components/set-default-section-button.tsx (T-802, D-21), parseBoolean e toNumber di lib/utils.ts (T-1102)"
    - "tests/tooling/knip-baseline.json (T-108) aggiornata togliendo esattamente le triple (tipo, file, simbolo) degli elementi rimossi; npm run typecheck, npm run lint, npm test e next build terminano con exit code 0"

  acceptance_criteria:
    - id: AC-1101-1
      given: "le rimozioni approvate applicate e tests/tooling/knip-baseline.json aggiornata"
      when: "tests/tooling/deadcode.test.ts esegue knip con reporter JSON e lo confronta con diffKnipAgainstBaseline di T-108"
      then: "nessuno dei file e simboli rimossi compare nel report e il numero di voci del report è uguale a quello della baseline aggiornata"
    - id: AC-1101-2
      given: "le rimozioni approvate applicate"
      when: "il test importa dinamicamente app/api/projects/route.ts, app/api/projects/[id]/route.ts e app/api/auth/config/route.ts"
      then: "GET è undefined in tutti e tre i moduli, mentre POST, PATCH e DELETE dove esistevano sono ancora funzioni"
    - id: AC-1101-3
      given: "le rimozioni approvate applicate"
      when: "il test esegue git grep di runQueuedExtractionJobs, getJobStats, GOOGLE_ADS_METRICS_FILE, DEFAULT_METRICS_PROVIDER, api/auth/session, LEGACY_KEYS e getSettingValue su app, components, lib, il file del proxy e .env.example"
      then: "ogni ricerca restituisce 0 righe (exit code 1 di git grep)"
    - id: AC-1101-4
      given: "il repository dopo le rimozioni"
      when: "il test lancia tsc --noEmit e il lint di T-102"
      then: "entrambi i comandi terminano con exit code 0"

  target_tests:
    - file: "tests/tooling/deadcode.test.ts"
      covers: [AC-1101-1, AC-1101-2, AC-1101-3, AC-1101-4]

  security_notes:
    - "A01 Broken Access Control / CWE-284: tolta dalla allowlist pubblica del proxy la voce /api/auth/session e rimossi 5 handler GET non usati che esponevano dati di progetto, riducendo la superficie raggiungibile"
    - "A01 Broken Access Control / CWE-73 (controllo esterno di un percorso file): verificata l'assenza di fs.readFile su un percorso preso da GOOGLE_ADS_METRICS_FILE (rimosso da T-901)"
    - "A07 Authentication Failures / CWE-287: eliminato il percorso di bootstrap che crea un utente da un hash letto in app_settings (LEGACY_KEYS); resta solo il bootstrap da env validata (T-201)"
    - "Processo: ogni rimozione è una proposta approvata dall'umano (L-COL-021), con evidenza grep allegata"

  out_of_scope:
    - "Consolidamento dei duplicati e uso di parseBoolean/toNumber: T-1102"
    - "Collegamento di SetDefaultSectionButton: T-802"

- id: T-1102
  title: "Duplicazioni consolidate"
  macrotask: "cleanup"
  depends_on: [T-1101]

  objective: >
    Sostituire le copie di helper, tipi e componenti con un'unica definizione condivisa, rispettando il
    contratto di altitudine D-22 (i componenti non raggiungono lib/prisma.ts), e fissare con jscpd una
    soglia che impedisca il ritorno dei cloni.

  definition_of_done:
    - "lib/view/format.ts senza import server: formatDate (Date, stringa o null) e jobStatusTone, usati da app/page.tsx, app/projects/[id]/page.tsx, app/projects/[id]/sections/page.tsx e components/admin-users-dashboard.tsx; copie locali rimosse"
    - "lib/http/search-params.ts: readParam e readFlag al posto di getValue e checked in app/projects/[id]/page.tsx e app/projects/[id]/results/page.tsx e delle closure getValue, toNumber e toBool di parseResultsFilters in lib/modules/results-filters.ts; readFlag e la conversione numerica usano parseBoolean e toNumber di lib/utils.ts"
    - "parseBoolean di lib/utils.ts accetta unknown (boolean e stringhe 1, true, yes, on) e sostituisce la copia locale di lib/modules/project-settings.ts senza cambiare i risultati dei test di T-809"
    - "Componente unico components/delete-entity-button.tsx (props: endpoint, testo di conferma, etichetta, classe, redirectTo) al posto di DeleteProjectButton e DeleteSubprojectButton"
    - "ExportScope ed ExportFormat definiti una sola volta in lib/modules/export-types.ts (nessun import di lib/prisma.ts), importati da lib/modules/export.ts, components/google-sheets-export-button.tsx e components/onboarding-review-export-step.tsx"
    - "Helper unico setSessionCookie(response, user) in lib/auth/session-cookie.ts usato da tutti i punti che emettono il cookie di sessione (oggi 4: api/auth/login, api/auth/register, PATCH api/auth/config, PATCH api/user/preferences; il numero effettivo dopo T-501 si riverifica nel task)"
    - "jscpd come devDependency a versione fissata, configurato con min-tokens 50 sui file elencati sopra; nessun cambiamento di comportamento (snapshot di caratterizzazione invariati)"
    - "Advisory braces GHSA-vfj7-8cjw-p6xm (voce di tests/tooling/audit-allowlist.json con closedBy T-1102, decisione dell'utente del 2026-10-04): rivalutata con jscpd 5 e con la versione di eslint-config-next disponibile; se nessun pacchetto dell'albero la riporta più la voce si toglie, altrimenti si riporta all'utente il percorso residuo"

  acceptance_criteria:
    - id: AC-1102-1
      given: "i file elencati nella configurazione di jscpd"
      when: "tests/tooling/duplication.test.ts esegue jscpd con min-tokens 50 e reporter JSON"
      then: "il report contiene 0 duplicati"
    - id: AC-1102-2
      given: "il repository dopo il consolidamento"
      when: "il test esegue git grep di 'function jobStatusTone', 'function formatDate', 'function getValue', 'function checked' e 'type ExportScope'"
      then: "jobStatusTone e formatDate compaiono solo in lib/view/format.ts, getValue e checked non compaiono, type ExportScope compare solo in lib/modules/export-types.ts"
    - id: AC-1102-3
      given: "il repository dopo il consolidamento"
      when: "il test esegue git grep di 'createSessionToken(' in app"
      then: "la ricerca restituisce 0 righe e la chiamata compare solo in lib/auth/session-cookie.ts"
    - id: AC-1102-4
      given: "le suite di caratterizzazione di auth, progetti ed export"
      when: "si eseguono senza aggiornare alcuno snapshot"
      then: "tutte terminano con exit code 0"

  target_tests:
    - file: "tests/tooling/duplication.test.ts"
      covers: [AC-1102-1, AC-1102-2, AC-1102-3]
    - file: "tests/integration/characterization/auth.char.test.ts"
      covers: [AC-1102-4]
    - file: "tests/integration/characterization/projects-authz.char.test.ts"
      covers: [AC-1102-4]
    - file: "tests/integration/characterization/export.char.test.ts"
      covers: [AC-1102-4]

  security_notes:
    - "A07 Authentication Failures / CWE-1004 e CWE-614 (attributi del cookie): httpOnly, SameSite=Lax, secure e path / definiti in un solo punto, nessuna emissione divergente del cookie di sessione"
    - "A06 Insecure Design / CWE-1061: i tipi condivisi lato client stanno fuori dai moduli che importano prisma, nel rispetto del contratto D-22 verificato da T-109"
    - "A03 Software Supply Chain Failures / CWE-1357 (componenti di terze parti non verificati): jscpd aggiunto solo come devDependency a versione esatta, lockfile aggiornato e npm audit senza nuove vulnerabilità high o critical"

  out_of_scope:
    - "Rimozione del codice morto: T-1101"

- id: T-1103
  title: "Schema DB ripulito e indici per l'ordinamento dei risultati"
  macrotask: "cleanup"
  depends_on: [T-403, T-801, T-707]

  objective: >
    Allineare schema e indici all'uso reale: indici per l'ordinamento stabile dei risultati di T-801,
    rimozione degli indici ridondanti, default del provider di autocomplete non fittizio, unicità reale delle
    righe globali di brand e pattern, drift tra migrazioni e schema.prisma risolto o documentato.

  definition_of_done:
    - "Migrazione con indici keyword_candidates (project_id, score_source, score DESC, keyword, id) e (subproject_id, score_source, score DESC, keyword, id), nello stesso ordine e con la stessa posizione dei NULL della costante RESULTS_ORDER_BY di lib/modules/results-order.ts (T-707, T-801); se al momento del task T-707 non è completato e la costante non contiene score_source, gli indici seguono la costante in vigore e la nota per T-707 è registrata in SESSION-STATE"
    - "Indici ridondanti rimossi dopo verifica: google_sheets_credentials_user_id_idx (duplica l'unique su user_id), users_role_idx e users_status_idx (bassa cardinalità), e tra gli indici keyword_candidates [project_id, *] e [subproject_id, *] solo quelli che EXPLAIN mostra inutilizzati; elenco finale approvato dall'umano"
    - "Project.autocomplete_provider con @default(GOOGLE_DIRECT) al posto di MOCK (ALTER COLUMN SET DEFAULT, righe esistenti invariate)"
    - "AppSetting.is_secret: scritto da upsertSettingValue e mai letto; nel task si decide se usarlo (gli snapshot non restituiscono mai valori is_secret) o rimuoverlo con migrazione, decisione registrata in SESSION-STATE"
    - "users_single_root_admin_idx (indice unico parziale della migrazione 0005) non esprimibile in schema.prisma: commento nello schema e verifica della sua presenza nel test; prisma migrate diff tra migrazioni e schema senza differenze"
    - "Unicità delle righe globali: indici unici parziali brand_blacklist (brand) WHERE project_id IS NULL e expansion_patterns (pattern) WHERE project_id IS NULL, con deduplica dei duplicati esistenti nella stessa migrazione"
    - "Migrazione provata prima sul DB di staging (D-04, T-203)"

  acceptance_criteria:
    - id: AC-1103-1
      given: "10.000 candidate in un progetto del DB di test e ANALYZE eseguito"
      when: "il test esegue EXPLAIN (FORMAT JSON) della query di pagina di T-801 (WHERE project_id, ORDER BY secondo RESULTS_ORDER_BY, LIMIT 100)"
      then: "il piano contiene un Index Scan sul nuovo indice di project_id e nessun nodo Sort"
    - id: AC-1103-2
      given: "una riga brand_blacklist con project_id NULL e brand 'acme'"
      when: "si inserisce una seconda riga con project_id NULL e brand 'acme'"
      then: "l'inserimento fallisce con codice Postgres 23505 e la tabella ha 1 sola riga globale 'acme'"
    - id: AC-1103-3
      given: "il DB di test migrato"
      when: "il test interroga pg_indexes ed esegue prisma migrate diff dalle migrazioni allo schema"
      then: "users_single_root_admin_idx è presente, google_sheets_credentials_user_id_idx è assente e migrate diff termina con exit code 0 senza differenze"
    - id: AC-1103-4
      given: "il DB di test migrato"
      when: "si crea un progetto con prisma.project.create senza autocomplete_provider"
      then: "la riga salvata ha autocomplete_provider GOOGLE_DIRECT"

  target_tests:
    - file: "tests/integration/schema-indexes.test.ts"
      covers: [AC-1103-1, AC-1103-2, AC-1103-3, AC-1103-4]

  security_notes:
    - "A06 Insecure Design / CWE-1188 (default insicuro): il default MOCK del provider di autocomplete produceva keyword fittizie; il nuovo default è il provider reale"
    - "A08 Software or Data Integrity Failures / CWE-694 (identificatori duplicati): brand e pattern globali unici anche con project_id NULL"
    - "A02 Security Misconfiguration / CWE-16: migrazioni applicate prima allo staging separato (T-203), mai direttamente al DB di produzione da una Preview"

  out_of_scope:
    - "Correzione della query di paginazione: T-801"
    - "Modello workspace e nuove colonne di proprietà: T-1501"

- id: T-1104
  title: "Accessibilità di base"
  macrotask: "cleanup"
  depends_on: [T-405]

  objective: >
    Portare a zero le violazioni di accessibilità serious e critical rilevate da axe-core su login, dashboard
    e risultati, e correggere i difetti noti: focus della modale di export Sheets, pulsanti a sola icona
    senza nome accessibile, anteprima delle preferenze non ripristinata, titolo della pagina che ignora il
    branding.

  definition_of_done:
    - "@axe-core/playwright come devDependency a versione fissata, usato da tests/e2e/a11y.spec.ts su /login, dashboard e risultati con l'utente seed di T-103"
    - "Modale di components/google-sheets-export-button.tsx: all'apertura il focus va al primo campo, Tab e Shift+Tab restano dentro il dialog, Esc chiude, alla chiusura il focus torna al pulsante che l'ha aperta"
    - "Pulsanti con sola icona o simbolo segnalati da axe hanno aria-label descrittivo (i pulsanti di riordino delle sezioni sono in T-808)"
    - "components/personalization-settings-card.tsx: uscendo dalla pagina senza salvare (unmount) data-theme, data-font-scale e data-color-vision tornano ai valori salvati"
    - "app/layout.tsx: generateMetadata usa branding.appName per il titolo al posto del valore statico 'Seo God Mode'"

  acceptance_criteria:
    - id: AC-1104-1
      given: "l'app avviata su DB di test con utente seed autenticato"
      when: "axe-core analizza /login, la dashboard e la pagina risultati di un progetto"
      then: "il numero di violazioni con impact serious o critical è 0 su ciascuna pagina"
    - id: AC-1104-2
      given: "la pagina risultati con Google Sheets collegato"
      when: "l'utente apre la modale di export Sheets, preme Tab 20 volte e poi Esc"
      then: "dopo ogni Tab document.activeElement è dentro l'elemento role=dialog e dopo Esc è il pulsante che ha aperto la modale"
    - id: AC-1104-3
      given: "un utente con tema salvato DARK nella pagina /personalizza"
      when: "seleziona il tema LIGHT senza salvare e naviga alla dashboard"
      then: "l'elemento html ha data-theme uguale a 'DARK'"
    - id: AC-1104-4
      given: "il branding con appName 'Acme SEO'"
      when: "si apre /login"
      then: "document.title contiene 'Acme SEO'"

  target_tests:
    - file: "tests/e2e/a11y.spec.ts"
      covers: [AC-1104-1, AC-1104-2, AC-1104-3, AC-1104-4]

  security_notes:
    - "A05 Injection / CWE-79: appName entra nel titolo tramite i metadata di Next (testo con escaping), mai con dangerouslySetInnerHTML"
    - "A03 Software Supply Chain Failures / CWE-1357: @axe-core/playwright solo come devDependency a versione esatta, lockfile aggiornato e npm audit senza nuove vulnerabilità high o critical"

  out_of_scope:
    - "Traduzioni e attributo lang dinamico: T-1301"
    - "Etichette dei pulsanti di riordino sezioni: T-808"

- id: T-1105
  title: "Prestazioni per richiesta: utente e branding in cache"
  macrotask: "cleanup"
  depends_on: [T-501, T-506]

  objective: >
    Eliminare il lavoro ripetuto a ogni richiesta: una sola risoluzione dell'utente condivisa da layout e
    pagina, branding servito da cache invalidata al salvataggio, nessun bootstrap del primo utente nei
    percorsi di login e registrazione, totali della dashboard admin con una sola query.

  definition_of_done:
    - "getOptionalAuthenticatedUserFromCookies (lib/auth/current-user.ts) avvolta in cache() di React: layout e pagina della stessa richiesta condividono la risoluzione; la cache vive solo nella richiesta e la verifica della sessione di T-501 resta per ogni richiesta"
    - "getBrandingSnapshot (lib/integrations/branding.ts) servita da cache con tag 'branding' (unstable_cache oppure direttiva use cache con cacheTag, secondo la configurazione di Next 16 di T-404); updateBrandingSettings invalida il tag; la cache contiene solo dati pubblici di branding"
    - "verifyLoginCredentials e registerUser (lib/auth/credentials.ts) non chiamano più ensureLegacyDefaultUser; il bootstrap del primo utente avviene solo quando la tabella users è vuota (una count) secondo le regole di T-201"
    - "Totali di listAdminUsers (lib/admin/users.ts) calcolati con una sola groupBy su role e status (o una SELECT con FILTER) al posto dei 5 count separati, coerenti con la correzione di T-507"
    - "Contatore di query per tabella e tipo in tests/helpers/query-counter.ts (riusa l'helper nato con T-1004 se già presente, altrimenti lo crea qui)"

  acceptance_criteria:
    - id: AC-1105-1
      given: "un utente autenticato"
      when: "si rendono layout e DashboardPage nella stessa richiesta"
      then: "il contatore registra esattamente 1 query SELECT sulla tabella users"
    - id: AC-1105-2
      given: "la cache del branding già popolata"
      when: "si rende /login due volte, poi il root admin invia PATCH /api/settings/branding con appName 'Nuovo' e si rende /login di nuovo"
      then: "la seconda resa esegue 0 query su app_settings e la terza mostra 'Nuovo' nel markup"
    - id: AC-1105-3
      given: "un DB con utenti già presenti incluso il root admin"
      when: "un utente invia POST /api/auth/login con credenziali valide"
      then: "il contatore registra 0 query di bootstrap (nessuna findFirst su users ordinata per created_at e nessuna lettura di app_settings)"
    - id: AC-1105-4
      given: "50 utenti con ruoli e stati misti"
      when: "il root admin chiama GET /api/admin/users"
      then: "il contatore registra al massimo 2 query sulla tabella users e i totali coincidono con i conteggi calcolati nel test"

  target_tests:
    - file: "tests/integration/request-query-count.test.ts"
      covers: [AC-1105-1, AC-1105-2, AC-1105-3, AC-1105-4]

  security_notes:
    - "A01 Broken Access Control / CWE-524 (cache con informazioni sensibili): l'utente è in cache solo per la durata della richiesta (React cache), mai tra richieste o utenti diversi; la cache condivisa contiene solo il branding pubblico"
    - "A07 Authentication Failures / CWE-613: la cache per richiesta non salta il controllo di revoca della sessione di T-501"

  out_of_scope:
    - "Paginazione e ricerca della dashboard admin: T-507"
    - "Lettura leggera dello stato onboarding: T-1004"
```

## Self-check

- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0 (in isolamento i soli riferimenti non risolti sono T-108, T-802, T-501, T-403, T-801, T-405, T-506, di altri moduli).
- Semantico: `self-check-checklist.md` punti 6-10 applicati a T-1101..T-1105.
