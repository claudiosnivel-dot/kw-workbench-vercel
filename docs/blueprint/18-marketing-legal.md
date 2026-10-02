# 18-marketing-legal — Macrotask `marketing-legal`

> Landing pubblica IT/EN con SEO tecnico, pagina prezzi dalla configurazione dei piani, pagine legali versionate, diritti GDPR (export e cancellazione account) e contatti; nasce dai rilievi dell'audit 2026-10-02: `/` richiede il login (il proxy reindirizza ogni anonimo a `/login`), nessuna pagina pubblica, nessun testo legale, nessun modo per l'utente di esportare o cancellare i propri dati.

## Obiettivo del macrotask
Oggi `middleware.ts` ammette senza sessione solo `/login`, `/register` e le API di autenticazione, `app/page.tsx` è la dashboard e `app/layout.tsx` ha `lang="it"` e un `metadata.title` statico. Il macrotask rende `/` una landing per gli anonimi e la dashboard per gli autenticati (D-16), aggiunge pagine marketing con URL per lingua (italiano senza prefisso, inglese con `/en`) incluse in sitemap e hreflang, una pagina prezzi letta dalla stessa configurazione che applica i limiti (`lib/billing/plans.ts`), le pagine legali renderizzate da file forniti dall'utente (D-15, l'agente non scrive testi legali), export e cancellazione dell'account, e un modulo contatti protetto da rate limit e CAPTCHA. Tutte le route pubbliche stanno in un unico elenco (`lib/marketing/routes.ts`) letto sia dal proxy sia dalla sitemap.

## Task atomici

```yaml
- id: T-1801
  title: "Landing pubblica IT/EN e SEO tecnico"
  macrotask: "marketing-legal"
  depends_on: [T-1302, T-302]

  objective: >
    Mostrare agli anonimi una landing in italiano su / e in inglese su /en, lasciando la
    dashboard agli autenticati (D-16), con metadata, Open Graph, hreflang, sitemap.xml e
    robots.txt, senza rendere pubblica alcuna route dell'applicazione.

  definition_of_done:
    - "lib/marketing/routes.ts: elenco MARKETING_ROUTES (path, locale, alternate, inSitemap) letto dal proxy e dalla sitemap; T-1801 vi inserisce '/' e '/en'; T-1802, T-1803 e T-1805 vi aggiungono prezzi, pagine legali e contatti."
    - "D-16: app/page.tsx risolve l'utente con getOptionalAuthenticatedUserFromCookies: anonimo → landing italiana (components/marketing/landing.tsx), autenticato → dashboard attuale; app/en/page.tsx rende la landing inglese. Le pagine marketing hanno URL per lingua perché sitemap e hreflang richiedono URL distinti; l'app autenticata continua a usare la risoluzione della lingua di T-1301."
    - "Proxy (proxy.ts dopo T-404, meccanismo dei percorsi pubblici di T-302): ammessi senza sessione, a match esatto, i path di MARKETING_ROUTES più /sitemap.xml, /robots.txt e le immagini Open Graph in public/og/; tutte le altre route restano protette come oggi (pagine → /login?next=, API → 401)."
    - "Metadata: generateMetadata per lingua con title, description, alternates.canonical, alternates.languages (it → /, en → /en, x-default → /), openGraph con title, description, url, siteName dal branding, locale it_IT o en_US, type website e immagine 1200x630 in public/og/; metadataBase da APP_PUBLIC_URL validata in lib/env.ts (T-201)."
    - "app/sitemap.ts: URL assoluti delle voci di MARKETING_ROUTES con inSitemap true e alternates per lingua; app/robots.ts: Allow /, Disallow per /api/, /projects, /admin, /onboarding, /personalizza, /workspace, /billing, /account, /invites, riga Sitemap con URL assoluto."
    - "components/top-nav.tsx: per gli anonimi mostra solo logo, link ai prezzi, Accedi, Registrati e selettore lingua verso l'URL alternativo; nessun link dell'app né LogoutButton."
    - "Testi della landing nei cataloghi messages/it.json e messages/en.json (T-1302), rivedibili dall'utente; nessuna affermazione su clienti, numeri o certificazioni non forniti dall'utente."

  acceptance_criteria:
    - id: AC-1801-1
      given: "un visitatore anonimo"
      when: "apre / e poi /en"
      then: "entrambe le pagine rispondono 200 senza redirect a /login; / ha html lang 'it' e /en html lang 'en'; entrambe contengono un link con href '/register' e 0 link verso /projects"
    - id: AC-1801-2
      given: "un utente autenticato e un visitatore anonimo"
      when: "l'utente autenticato apre / e l'anonimo apre /projects"
      then: "l'utente autenticato vede la dashboard (intestazione Panoramica) e non la landing; l'anonimo riceve un redirect a /login?next=%2Fprojects"
    - id: AC-1801-3
      given: "un visitatore anonimo"
      when: "apre /en e ne legge il head"
      then: "il head contiene link rel alternate con hreflang it (href /), en (href /en) e x-default, un link canonical verso /en e i meta og:title e og:locale con valore en_US"
    - id: AC-1801-4
      given: "APP_PUBLIC_URL=https://example.test"
      when: "si invocano le funzioni di app/sitemap.ts e app/robots.ts e si richiedono /sitemap.xml e /robots.txt da anonimo attraverso il proxy"
      then: "la sitemap contiene https://example.test/ e https://example.test/en; robots contiene 'Disallow: /api/', 'Disallow: /projects' e 'Sitemap: https://example.test/sitemap.xml'; le due richieste anonime ricevono 200 senza redirect"

  target_tests:
    - file: "tests/e2e/landing.spec.ts"
      covers: [AC-1801-1, AC-1801-2, AC-1801-3]
    - file: "tests/integration/sitemap-robots.test.ts"
      covers: [AC-1801-4]

  security_notes:
    - "A01 Broken Access Control / CWE-863 (Incorrect Authorization): i percorsi pubblici sono un elenco a match esatto; nessun prefisso generico (ad esempio tutto /en) che renda pubbliche route dell'app."
    - "A02 Security Misconfiguration / CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor): robots.txt non è un controllo d'accesso; le route escluse restano protette dal proxy."
    - "A05 Injection / CWE-79 (Cross-site Scripting): i testi della landing provengono da cataloghi statici; nessun parametro di query viene renderizzato."

  out_of_scope:
    - "Pagina prezzi: T-1802."
    - "Pagine legali e footer: T-1803."
    - "Analytics: escluse da D-13."

- id: T-1802
  title: "Pagina prezzi generata dalla configurazione dei piani"
  macrotask: "marketing-legal"
  depends_on: [T-1601, T-1801, T-1604]

  objective: >
    Pubblicare /pricing e /en/pricing generate da lib/billing/plans.ts, la stessa fonte
    usata dall'enforcement, con CTA verso registrazione o fatturazione; finché i valori di
    D-14 sono placeholder la pagina non mostra prezzi.

  definition_of_done:
    - "lib/billing/pricing-view.ts: buildPricingView(plans, locale, viewer) restituisce, per ogni piano con public true nell'ordine di order, nome (chiave i18n), prezzo visualizzato per intervallo e righe dei limiti generate dalle stesse chiavi usate da getEntitlements; components/marketing/pricing-table.tsx la rende; nessun valore numerico scritto nel markup."
    - "Pagine app/pricing/page.tsx e app/en/pricing/page.tsx; /pricing e /en/pricing aggiunte a MARKETING_ROUTES (proxy pubblico e sitemap) con metadata canonical e alternates it/en come T-1801."
    - "CTA: anonimo → /register?plan=<id>; autenticato → /billing?plan=<id> (pagina di T-1604, dipendenza implicita segnalata nel Self-check); piano free → /register per l'anonimo e dashboard per l'autenticato."
    - "Con isPlansConfigured() false (placeholder di D-14) la pagina mostra l'avviso con chiave pricing.comingSoon e nessun prezzo né CTA di acquisto, in qualsiasi ambiente."

  acceptance_criteria:
    - id: AC-1802-1
      given: "piani di prova con 2 piani pubblici (prezzi '9 €' e '29 €', maxProjects 3 e 20) e 1 piano non pubblico"
      when: "si rende la pagina /pricing"
      then: "la pagina contiene 2 elementi con data-testid pricing-plan, i testi '9 €' e '29 €' e i valori 3 e 20 per i progetti; il nome del piano non pubblico non compare"
    - id: AC-1802-2
      given: "i piani di prova e un workspace W su pro"
      when: "si porta maxProjects di pro da 20 a 25 con setPlansForTesting, si rende di nuovo la pagina e si chiama getEntitlements(W)"
      then: "sia la pagina sia getEntitlements riportano 25"
    - id: AC-1802-3
      given: "un visitatore anonimo e un utente autenticato"
      when: "aprono /pricing"
      then: "la CTA del piano pro ha href '/register?plan=pro' per l'anonimo e '/billing?plan=pro' per l'utente autenticato; /sitemap.xml contiene /pricing e /en/pricing"
    - id: AC-1802-4
      given: "PLANS_CONFIG_STATUS uguale a 'placeholder-D14'"
      when: "si rende /pricing"
      then: "la pagina contiene il testo della chiave pricing.comingSoon e 0 elementi pricing-plan con prezzo o CTA di acquisto"

  target_tests:
    - file: "tests/integration/pricing-page.test.ts"
      covers: [AC-1802-1, AC-1802-2, AC-1802-3, AC-1802-4]

  security_notes:
    - "A06 Insecure Design / CWE-840 (Business Logic Errors): prezzi e limiti mostrati e applicati vengono dalla stessa configurazione; con placeholder nessun prezzo appare come reale."
    - "A06 / CWE-602 (Client-Side Enforcement of Server-Side Security): il parametro plan della CTA è solo una preselezione; il checkout di T-1602 rivalida piano e ruolo lato server."

  out_of_scope:
    - "Checkout e pagina di fatturazione: T-1602 e T-1604."
    - "Valori dei prezzi: D-14."

- id: T-1803
  title: "Pagine legali versionate"
  macrotask: "marketing-legal"
  depends_on: [T-1801, T-1405]

  objective: >
    Pubblicare privacy, termini e cookie in italiano e inglese a partire da file markdown
    forniti dall'utente o dal consulente (D-15), con versione dei termini uguale a quella
    usata dal consenso (T-1405), footer con i link su landing e app, e nessun banner
    cookie finché il sito usa solo cookie tecnici.

  definition_of_done:
    - "Pagine /privacy, /terms, /cookies e /en/privacy, /en/terms, /en/cookies che rendono content/legal/<locale>/<doc>.md (locale it o en, doc privacy, terms o cookies); route aggiunte a MARKETING_ROUTES (proxy pubblico e sitemap)."
    - "Contenuti: l'agente crea solo segnaposto con front matter status placeholder e il testo 'Documento in preparazione', mai testi legali (D-15). Front matter obbligatorio: version e last_updated."
    - "La pagina dei termini mostra la versione; la costante di versione introdotta da T-1405 per il consenso è la fonte e il front matter version di terms deve coincidere. npm run legal:check (scripts/legal-check.mjs) esce con codice 1 se un file manca, è placeholder o ha version diversa dalla costante; è un passo della checklist di rilascio (docs/RELEASE.md di T-605), non del build."
    - "Rendering markdown senza HTML grezzo (ad esempio react-markdown senza rehype-raw), dipendenza a versione esatta e npm audit senza advisory high o critical; link esterni con rel noopener noreferrer."
    - "components/site-footer.tsx montato in app/layout.tsx su landing, pagine pubbliche e app, con link a privacy, termini e cookie nella lingua corrente."
    - "lib/legal/cookie-inventory.ts: inventario con nome, scopo e categoria dei cookie impostati dall'app; oggi solo tecnici: kwb_session, kwb_google_ads_oauth_state, kwb_google_sheets_oauth_state, più il cookie di lingua di T-1301 e kwb_workspace di T-1504 quando presenti. Nessun banner cookie finché tutti sono tecnici. Eventuali cookie di terze parti di Paddle.js e Turnstile: da verificare nel task e da riportare all'utente per la cookie policy (D-15)."

  acceptance_criteria:
    - id: AC-1803-1
      given: "i 6 file legali presenti (segnaposto o forniti)"
      when: "un anonimo apre /privacy, /terms, /cookies, /en/privacy, /en/terms e /en/cookies"
      then: "ogni pagina risponde 200 senza redirect, contiene un h1 e ha html lang uguale alla lingua del percorso"
    - id: AC-1803-2
      given: "la costante di versione dei termini di T-1405 e una fixture con version discordante"
      when: "si apre /terms ed esegue npm run legal:check sui file reali e sulla fixture"
      then: "/terms mostra la stessa stringa di versione della costante; legal:check esce con codice 0 sui file reali conformi e con codice 1 sulla fixture discordante, nominando il file"
    - id: AC-1803-3
      given: "la landing, /login e la dashboard e il codice sorgente dell'app"
      when: "si ispeziona il footer e si esegue la scansione dei nomi di cookie impostati in app/** e lib/**"
      then: "il footer contiene 3 link con href /privacy, /terms e /cookies (con prefisso /en sulle pagine inglesi); nessuna pagina contiene un elemento con data-testid cookie-banner; la scansione trova 0 nomi di cookie assenti dall'inventario"
    - id: AC-1803-4
      given: "una fixture markdown che contiene un tag script con alert(1) e un tag img con attributo onerror"
      when: "la pagina legale rende la fixture"
      then: "il DOM della pagina non contiene elementi script né img provenienti dal contenuto e nessun dialog alert viene aperto"

  target_tests:
    - file: "tests/e2e/legal-pages.spec.ts"
      covers: [AC-1803-1, AC-1803-2, AC-1803-3, AC-1803-4]
    - file: "tests/tooling/legal-check.test.ts"
      covers: [AC-1803-2]
    - file: "tests/tooling/cookie-inventory.test.ts"
      covers: [AC-1803-3]

  security_notes:
    - "A05 Injection / CWE-79 (Cross-site Scripting): markdown reso senza HTML grezzo; anche con file forniti da terzi nessun tag eseguibile entra nel DOM."
    - "A03 Software Supply Chain Failures / CWE-1395 (Dependency on Vulnerable Third-Party Component): libreria markdown a versione esatta, lockfile aggiornato, npm audit senza high o critical."
    - "A02 Security Misconfiguration / CWE-1188 (Initialization of a Resource with an Insecure Default): i segnaposto bloccano il rilascio tramite legal:check, così non si pubblica il servizio senza testi legali validi."

  out_of_scope:
    - "Redazione dei testi legali: D-15 (utente, consulente o generatore)."
    - "Consenso e riaccettazione al cambio di versione: T-1405."

- id: T-1804
  title: "Esportazione dei dati e cancellazione dell'account (GDPR)"
  macrotask: "marketing-legal"
  depends_on: [T-1501, T-1603, T-1704, T-906]

  objective: >
    Permettere all'utente di scaricare i propri dati in JSON e di cancellare l'account,
    bloccando la cancellazione se lascerebbe un abbonamento attivo o un workspace condiviso
    senza OWNER, revocando sessioni e credenziali OAuth e anonimizzando i log
    amministrativi che lo citano.

  definition_of_done:
    - "GET /api/account/export (utente autenticato): risposta in streaming (ReadableStream) con Content-Type application/json, Content-Disposition attachment con filename account-export-<data>.json e Cache-Control no-store; contiene profilo (id, email, display_name, created_at, preferenze, versione e data di accettazione dei termini), membership (workspace id, nome, ruolo) e, per i workspace di cui l'utente è unico OWNER, progetti con sezioni, seed e keyword_candidates e stato dell'abbonamento (piano, status, periodo)."
    - "Esclusi dall'export: password_hash, session_version, refresh token cifrati, token_hash di verifica, reset e inviti, dati di altri utenti; dei workspace condivisi in cui l'utente non è unico OWNER si riportano solo id, nome e ruolo."
    - "DELETE /api/account con la password attuale: password errata → 403 code INVALID_PASSWORD; root admin → 409 code ROOT_ADMIN; unico OWNER di un workspace con abbonamento trialing, active, past_due o paused → 409 con code ACTIVE_SUBSCRIPTION, elenco dei workspace e invito a disdire da /billing (T-1604); unico OWNER di un workspace con altri membri → 409 code OWNERSHIP_TRANSFER_REQUIRED (trasferimento con T-1503)."
    - "Prima della transazione: revoca del refresh token Google Sheets presso https://oauth2.googleapis.com/revoke (helper di T-906 se presente). In transazione: eliminazione dei workspace in cui l'utente è unico membro (incluso il personale) con i loro progetti in cascata, delle membership, degli inviti pendenti verso la sua email se la tabella esiste (T-1503), della GoogleSheetsCredential e della riga users; i cookie di sessione esistenti smettono di valere perché l'utente non esiste più."
    - "Se admin_audit_log esiste (T-1704): le righe che citano l'utente restano, con actor_user_id o target_id impostati a null e metadata ripuliti da id, username ed email. billing_events conservati per obblighi contabili (base giuridica e durata da D-15)."
    - "Pagina /account con 'Scarica i miei dati' ed 'Elimina account' (conferma con password), stringhe nei cataloghi it ed en."

  acceptance_criteria:
    - id: AC-1804-1
      given: "l'utente U unico OWNER di W1 (progetto 'P-U') e MEMBER di W2 di un altro utente (progetto 'P-Altro')"
      when: "U chiama GET /api/account/export"
      then: "la risposta è 200 con Content-Type application/json e Content-Disposition attachment; il JSON contiene l'email di U, 2 membership e il progetto 'P-U'; il corpo non contiene 'P-Altro', il valore di password_hash di U né la stringa refresh_token"
    - id: AC-1804-2
      given: "U unico OWNER di W1 con abbonamento active"
      when: "U invia DELETE /api/account con la password giusta"
      then: "la risposta è 409 con code ACTIVE_SUBSCRIPTION e W1 nell'elenco; la riga users di U esiste ancora"
    - id: AC-1804-3
      given: "U senza abbonamenti, unico membro di W1, con credenziale Google Sheets e una sessione attiva"
      when: "U invia DELETE /api/account con la password giusta e poi riusa il vecchio cookie su GET /api/projects"
      then: "la DELETE risponde 200; users, memberships, W1, i progetti di W1 e google_sheets_credentials di U hanno 0 righe; il mock della revoca Google ha ricevuto 1 chiamata; la GET riceve 401"
    - id: AC-1804-4
      given: "righe di admin_audit_log con U come bersaglio"
      when: "U invia DELETE con una password sbagliata e poi con quella giusta"
      then: "la prima risposta è 403 INVALID_PASSWORD e nessuna riga viene cancellata; dopo la seconda il numero di righe di audit è invariato e nessuna contiene id, username o email di U"

  target_tests:
    - file: "tests/integration/gdpr.test.ts"
      covers: [AC-1804-1, AC-1804-2, AC-1804-3, AC-1804-4]

  security_notes:
    - "A01 Broken Access Control / CWE-639 (Authorization Bypass Through User-Controlled Key): l'export contiene solo dati dell'utente autenticato e dei workspace di cui è unico OWNER; nessun id accettato dal client."
    - "A07 Authentication Failures / CWE-306 (Missing Authentication for Critical Function): la cancellazione richiede la password attuale oltre alla sessione."
    - "A02 Security Misconfiguration / CWE-212 (Improper Removal of Sensitive Information Before Storage or Transfer): export privo di hash e segreti; refresh token revocato presso Google prima di cancellare la credenziale."
    - "A01 / CWE-359 (Exposure of Private Personal Information to an Unauthorized Actor): log amministrativi anonimizzati dopo la cancellazione."

  out_of_scope:
    - "Testi dell'informativa e periodi di conservazione: D-15."
    - "Dati conservati da Paddle come Merchant of Record: gestiti da Paddle secondo la propria informativa."

- id: T-1805
  title: "Contatti e supporto"
  macrotask: "marketing-legal"
  depends_on: [T-1402, T-1702]

  objective: >
    Offrire un modulo contatti pubblico protetto da rate limit e CAPTCHA che invia
    un'email all'indirizzo di supporto configurato, senza permettere iniezioni negli header
    né l'uso come relay di spam, e un link Supporto nell'app.

  definition_of_done:
    - "Pagine /contact e /en/contact aggiunte a MARKETING_ROUTES (proxy pubblico) con modulo: nome (massimo 100 caratteri), email, categoria (supporto, fatturazione, privacy, altro), messaggio (da 10 a 5000 caratteri) e widget Turnstile con action 'contact'; per gli utenti autenticati l'email è precompilata."
    - "POST /api/contact pubblico: rate limit di T-1701 (chiavi contact:ip e contact:email, soglie iniziali proposte e configurabili da env), poi CAPTCHA di T-1702, poi validazione, poi EmailSender di T-1402 verso SUPPORT_EMAIL (env validata) con Reply-To uguale all'email del mittente; risposta 202 con ok true."
    - "Validazione: nome, email e categoria rifiutati se contengono CR, LF o caratteri di controllo; email conforme al formato e lunga al massimo 254 caratteri; categoria da elenco chiuso; oggetto costruito dal server con la sola categoria; corpo in solo testo o HTML con escape di ogni campo; errori → 400 code VALIDATION_ERROR."
    - "Se il mittente è autenticato l'email riporta l'id utente e l'id del workspace corrente, nessun altro dato di progetto."
    - "Link Supporto verso /contact in components/top-nav.tsx (app) e nel footer di T-1803 (con /en/contact sulle pagine inglesi)."

  acceptance_criteria:
    - id: AC-1805-1
      given: "outbox email di test, SUPPORT_EMAIL=support@example.test e siteverify mockato con esito positivo"
      when: "un anonimo invia POST /api/contact con dati validi"
      then: "la risposta è 202; l'outbox contiene 1 email verso support@example.test con reply-to uguale all'email del mittente e il testo del messaggio nel corpo"
    - id: AC-1805-2
      given: "siteverify mockato con esito positivo"
      when: "si invia POST /api/contact con email 'a@example.com' seguita da CRLF e 'Bcc: x@evil.test', poi con un messaggio di 5001 caratteri"
      then: "entrambe le risposte sono 400 con code VALIDATION_ERROR e l'outbox contiene 0 email"
    - id: AC-1805-3
      given: "soglia di test per IP pari a 2"
      when: "si inviano 3 richieste valide dallo stesso IP e una richiesta senza token CAPTCHA da un altro IP"
      then: "la terza richiesta riceve 429 con Retry-After, quella senza token 400 CAPTCHA_REQUIRED; l'outbox contiene solo le prime 2 email"
    - id: AC-1805-4
      given: "un utente autenticato nel workspace W"
      when: "invia il modulo contatti e si rende la TopNav dell'app"
      then: "l'email nell'outbox contiene l'id dell'utente e l'id di W; la TopNav contiene un link con testo Supporto e href '/contact'"

  target_tests:
    - file: "tests/integration/contact.test.ts"
      covers: [AC-1805-1, AC-1805-2, AC-1805-3, AC-1805-4]
    - file: "tests/component/top-nav-support-link.test.tsx"
      covers: [AC-1805-4]

  security_notes:
    - "A05 Injection / CWE-93 (Improper Neutralization of CRLF Sequences): campi che finiscono negli header dell'email rifiutati se contengono CR o LF; oggetto costruito dal server."
    - "A05 / CWE-79 (Cross-site Scripting): contenuto dell'utente con escape nel corpo HTML dell'email."
    - "A06 Insecure Design / CWE-799 (Improper Control of Interaction Frequency): rate limit e CAPTCHA impediscono di usare il modulo come relay di spam."
    - "A02 Security Misconfiguration / CWE-798 (Use of Hard-coded Credentials): SUPPORT_EMAIL e chiave del provider email da env validata, mai nel sorgente."

  out_of_scope:
    - "Helpdesk o ticketing: non previsti."
    - "Chat dal vivo: non prevista."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
- Rilievi da confermare nel 00-INDEX: la CTA per utenti autenticati di T-1802 punta a `/billing` (T-1604, non tra le dipendenze); `/pricing` entra nella sitemap con T-1802 e non con T-1801 (la pagina nasce lì); anonimizzazione del registro admin in T-1804 condizionata all'esistenza di T-1704.
