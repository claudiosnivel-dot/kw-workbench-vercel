# 05-auth-hardening — Macrotask `auth-hardening`

> Irrobustimento di sessioni, errori, password, header HTTP e funzioni admin dopo Next 16; nasce dai rilievi dell'audit 2026-10-02 su token non revocabili, «Application error» per utenti sospesi, fughe di messaggi interni nelle API, scryptSync con enumerazione via timing, `next.config.ts` vuoto, branding modificabile da qualunque admin e dashboard admin con conteggi incoerenti.

## Obiettivo del macrotask

Chiudere i difetti di autenticazione e di gestione degli errori emersi dall'audit, sulla base stabile di Next 16 (T-404).
Le sessioni diventano revocabili lato server con un contatore per utente; le sessioni non più valide portano a un redirect pulito e a un 401 con codice stabile; tutte le API rispondono con un formato d'errore uniforme che non rivela dettagli interni; l'hash delle password smette di bloccare l'event loop e di rivelare quali username esistono; le risposte portano header di sicurezza e una CSP a nonce.
Infine le due funzioni amministrative toccate dall'audit (branding globale e dashboard utenti) diventano coerenti, atomiche e riservate al ruolo giusto.
L'isolamento resta applicativo (ecosistema `postgres-jsts`, D-02): ogni controllo vive nelle route e nei moduli di `lib/`, non in RLS.

## Task atomici

```yaml
- id: T-501
  title: "Sessioni revocabili e token minimale"
  macrotask: "auth-hardening"
  depends_on: [T-404, T-201]

  objective: >
    Rendere le sessioni revocabili lato server con un contatore per utente
    (users.session_version) e ridurre il token firmato ai soli claim uid, ver, iat ed
    exp, così che cambio password, reset o sospensione da admin e «Esci da tutti i
    dispositivi» invalidino i token già emessi, e togliere il rinnovo involontario del
    cookie a ogni salvataggio delle preferenze.

  definition_of_done:
    - "Nuova migrazione prisma/migrations/NNNN_user_session_version (numero successivo all'ultima cartella presente) che aggiunge users.session_version INTEGER NOT NULL DEFAULT 0; campo session_version Int con default 0 nel modello User di prisma/schema.prisma."
    - "lib/auth/session.ts: SessionPayload = { uid, ver, iat, exp }; createSessionToken({ userId, sessionVersion }) firma solo questi claim; verifySessionToken restituisce null (senza eccezioni, comportamento di T-301 conservato) per token con chiavi mancanti, tipi errati o nel vecchio formato con userId e username."
    - "lib/auth/current-user.ts resolveUserFromToken: oltre a status ACTIVE richiede che session_version letto dal DB sia uguale a payload.ver; findAuthUserById in lib/auth/credentials.ts seleziona session_version."
    - "Incremento atomico di session_version (update con increment) in: updateAuthCredentials quando cambia la password, updateUserAdminFields quando l'admin imposta una password o status SUSPENDED, nuovo endpoint POST /api/auth/logout-all che incrementa e azzera il cookie."
    - "PATCH /api/auth/config: dopo un cambio password riemette il cookie con il nuovo ver per il solo dispositivo corrente; il cambio del solo username non riemette il cookie (lo username non è più nel token)."
    - "PATCH /api/user/preferences non imposta più il cookie di sessione; le preferenze restano lette dal DB in current-user come oggi."
    - "Un solo helper (es. lib/auth/session-cookie.ts) crea il token e imposta il cookie per login, register e auth/config, con attributi invariati: httpOnly, SameSite=Lax, path /, secure da shouldUseSecureCookies, maxAge da getSessionMaxAgeSeconds."
    - "Pulsante «Esci da tutti i dispositivi» in components/auth-settings-card.tsx (pagina app/personalizza) che chiama POST /api/auth/logout-all e porta a /login."
    - "I token emessi prima del deploy diventano invalidi (D-05 ammette l'invalidazione delle sessioni); la conseguenza è annotata nel messaggio di commit e in SESSION-STATE."

  acceptance_criteria:
    - id: AC-501-1
      given: "utente A con due cookie di sessione ottenuti da due login distinti"
      when: "A cambia password con PATCH /api/auth/config usando il primo cookie"
      then: "la risposta è 200 con un nuovo Set-Cookie; GET /api/user/preferences con il secondo cookie risponde 401 e con il cookie nuovo risponde 200"
    - id: AC-501-2
      given: "utente B con cookie valido e root admin autenticato"
      when: "il root admin esegue PATCH /api/admin/users/[id di B] con newPassword, e in un secondo caso con status SUSPENDED"
      then: "in entrambi i casi users.session_version di B aumenta di 1 e GET /api/user/preferences con il vecchio cookie di B risponde 401"
    - id: AC-501-3
      given: "utente C con due cookie validi"
      when: "C chiama POST /api/auth/logout-all con uno dei due"
      then: "la risposta contiene Set-Cookie kwb_session con Max-Age=0, session_version di C è aumentata di 1 e entrambi i cookie ricevono 401 su GET /api/user/preferences"
    - id: AC-501-4
      given: "un login riuscito con POST /api/auth/login"
      when: "si decodifica il payload del cookie emesso e si chiama PATCH /api/user/preferences con themeMode LIGHT"
      then: "il payload ha esattamente le chiavi uid, ver, iat ed exp e la risposta 200 di PATCH non contiene l'header Set-Cookie"

  target_tests:
    - file: "tests/integration/session-revocation.test.ts"
      covers: [AC-501-1, AC-501-2, AC-501-3, AC-501-4]

  security_notes:
    - "OWASP A07:2025 Authentication Failures — CWE-613 (scadenza della sessione insufficiente): oggi un token rubato resta valido 7 giorni anche dopo cambio password, reset da admin o logout; con ver confrontato con users.session_version a ogni risoluzione server-side dell'utente il token è revocabile."
    - "CWE-315 (dati sensibili in chiaro in un cookie): il payload è base64url firmato, non cifrato; ruolo, stato, username, root admin e preferenze escono dal cookie."
    - "OWASP A04:2025 Cryptographic Failures — CWE-347 (verifica della firma): la firma HMAC-SHA256 è verificata con crypto.subtle.verify prima di leggere il payload; APP_SESSION_SECRET arriva dalla env validata di T-201, mai dal fallback."
    - "Il proxy verifica solo firma e scadenza, senza query: la revoca è applicata in pagine e route tramite current-user (isolamento applicativo, ecosistema postgres-jsts)."

  out_of_scope:
    - "Redirect pulito e pagine di errore per sessioni non più valide (T-502)."
    - "Recupero password via email (T-1404) e registro delle azioni admin (T-1704)."
    - "Sessioni per dispositivo con elenco e revoca singola."

- id: T-502
  title: "Utenti sospesi o eliminati: redirect pulito, 401 con codice e pagine di errore"
  macrotask: "auth-hardening"
  depends_on: [T-404]

  objective: >
    Quando il token è firmato ma l'utente è sospeso, eliminato o revocato, le pagine
    devono portare a /login rimuovendo il cookie e le API devono rispondere 401 JSON
    con codice stabile, invece dell'«Application error» di oggi; aggiungere le pagine
    not-found, error e global-error dell'App Router.

  definition_of_done:
    - "Helper requirePageUser() in lib/auth/page-guard.ts usato dalle 19 pagine che oggi chiamano requireAuthenticatedUserFromCookies (elenco ottenuto con grep in app/): se l'utente non si risolve chiama redirect verso /api/auth/session-ended invece di lanciare AuthRequiredError."
    - "Route GET /api/auth/session-ended, aggiunta ai percorsi pubblici del proxy: se il cookie presente non si risolve in un utente attivo lo azzera (Max-Age=0, stessi attributi del cookie di sessione) e risponde 303 verso /login?reason=session_ended; se l'utente è attivo non tocca il cookie e reindirizza a /."
    - "Nessun ciclo di redirect con il rinvio alla dashboard degli utenti già loggati introdotto da T-302: /login considera loggato solo un utente che si risolve dal DB, non la sola firma del token."
    - "/login mostra il messaggio «La sessione è terminata. Accedi di nuovo.» per reason=session_ended, preso da una whitelist di codici; valori sconosciuti ignorati, nessun testo dell'URL renderizzato."
    - "API: AuthRequiredError diventa 401 {error: 'Sessione non valida o scaduta. Effettua di nuovo il login.', code: 'AUTH_REQUIRED'} in tutte le route che chiamano requireAuthenticatedUserFromRequest, comprese quelle oggi senza try/catch (projects/[id]/run, subprojects/[subprojectId]/run, projects/[id]/results GET, api/projects, auth/config GET), tramite un'unica funzione condivisa che T-503 incorpora in withApiErrors; anche il 401 del proxy per le API anonime aggiunge code 'AUTH_REQUIRED'."
    - "lib/client/http.ts buildApiErrorMessage: con status 401 o code AUTH_REQUIRED restituisce sempre il messaggio italiano di sessione scaduta, anche se il body contiene error 'Unauthorized' (oggi il body ha la precedenza e il messaggio italiano non compare mai)."
    - "app/not-found.tsx (titolo «Pagina non trovata», link alla dashboard), app/error.tsx (client component con pulsante «Riprova» che chiama reset; mostra solo error.digest, mai message o stack) e app/global-error.tsx (con html e body propri come richiesto dall'App Router)."

  acceptance_criteria:
    - id: AC-502-1
      given: "utente con cookie firmato valido poi sospeso sul DB, con cookies() di next/headers che restituisce quel cookie"
      when: "il test chiama requirePageUser()"
      then: "viene lanciato il redirect di Next verso /api/auth/session-ended (errore con digest NEXT_REDIRECT e quella destinazione) e non AuthRequiredError"
    - id: AC-502-2
      given: "lo stesso utente sospeso con il suo cookie"
      when: "chiama POST /api/projects/[id]/run e GET /api/projects e la risposta viene passata a buildApiErrorMessage"
      then: "entrambe le risposte hanno status 401 e body con code 'AUTH_REQUIRED' e buildApiErrorMessage restituisce 'Sessione non valida o scaduta. Effettua di nuovo il login.'"
    - id: AC-502-3
      given: "due utenti, uno sospeso e uno attivo, ciascuno con il proprio cookie firmato"
      when: "ciascuno chiama GET /api/auth/session-ended"
      then: "per il sospeso la risposta è 303 con Location /login?reason=session_ended e Set-Cookie kwb_session con Max-Age=0; per l'attivo la risposta è un redirect verso / senza alcun Set-Cookie"
    - id: AC-502-4
      given: "utente loggato nel browser E2E e poi sospeso direttamente sul DB"
      when: "ricarica la dashboard"
      then: "l'URL finale è /login?reason=session_ended, la pagina contiene il testo «La sessione è terminata. Accedi di nuovo.», il cookie kwb_session non è più presente nel browser e nessuna risposta della catena ha status 500"
    - id: AC-502-5
      given: "utente loggato nel browser E2E"
      when: "apre /projects/id-inesistente"
      then: "la risposta ha status 404, la pagina mostra il titolo «Pagina non trovata» con un link a / e il testo 'Application error' non compare"

  target_tests:
    - file: "tests/integration/suspended-user.test.ts"
      covers: [AC-502-1, AC-502-2, AC-502-3]
    - file: "tests/e2e/error-pages.spec.ts"
      covers: [AC-502-4, AC-502-5]

  security_notes:
    - "OWASP A10:2025 Mishandling of Exceptional Conditions — CWE-755: oggi AuthRequiredError non gestita produce 500 e «Application error» su ogni pagina, compresa la dashboard; gestione esplicita con redirect nelle pagine e 401 nelle API."
    - "OWASP A07:2025 Authentication Failures — CWE-613: il cookie di una sessione non più valida viene rimosso lato server; CWE-352: /api/auth/session-ended non azzera il cookie di un utente attivo, quindi un link esterno non può forzare il logout."
    - "OWASP A05:2025 Injection — CWE-79: il parametro reason non viene mai riflesso, si mostra solo il testo associato a un codice in whitelist; CWE-209: error.tsx non mostra message né stack dell'errore."

  out_of_scope:
    - "Formato uniforme di tutti gli altri errori API (T-503)."
    - "Invio degli errori delle pagine a Sentry (T-601)."
    - "Traduzione dei messaggi (T-1303)."

- id: T-503
  title: "Errori API uniformi senza fughe di dettagli interni"
  macrotask: "auth-hardening"
  depends_on: [T-404]

  objective: >
    Introdurre in lib/http/errors.ts un modello d'errore unico (AppError con status e
    codice stabile) e un wrapper per i route handler che mappa validazione, JSON
    malformato, conflitti Prisma ed errori ignoti a risposte coerenti, senza mai
    restituire al client messaggi interni (Prisma, host del DB, stack).

  definition_of_done:
    - "lib/http/errors.ts: classe AppError(status, code, messaggio pubblico) con sottoclassi ValidationError (400, VALIDATION_ERROR), NotFoundError (404, NOT_FOUND), ConflictError (409, CONFLICT); wrapper withApiErrors(handler) per i route handler App Router."
    - "Mappatura in withApiErrors: AppError al suo status, code e messaggio; AuthRequiredError a 401 AUTH_REQUIRED (funzione condivisa di T-502); ForbiddenError a 403 FORBIDDEN; SyntaxError di request.json() a 400 INVALID_JSON; Prisma P2002 a 409 CONFLICT; Prisma P2025 a 404 NOT_FOUND; qualunque altro errore a 500 {error: 'Errore interno', code: 'INTERNAL_ERROR', requestId} senza il messaggio originale."
    - "requestId: valore dell'header x-request-id se presente e conforme a ^[A-Za-z0-9-]{8,64}$ (lo assegnerà il proxy in T-602), altrimenti crypto.randomUUID(); presente nel body di ogni risposta d'errore e nell'header x-request-id della risposta."
    - "Ogni 500 scrive una sola riga di console.error con requestId, metodo, percorso e stack (sostituita dal logger strutturato in T-602)."
    - "lib/auth/credentials.ts: validateUsername, validatePassword e «Nessuna modifica da salvare» lanciano ValidationError; «Username gia in uso» lancia ConflictError; AdminActionError di lib/admin/users.ts diventa sottoclasse di AppError con code esplicito."
    - "Tutti i route handler in app/api/** esportano handler avvolti da withApiErrors; rimossi i toResponseError locali (admin/users, admin/users/[id], settings/branding) e i ritorni di error.message di eccezioni non note (auth/register, auth/config, user/preferences)."
    - "Formato del body d'errore {error, code, requestId} documentato in testa a lib/http/errors.ts; lib/client/http.ts continua a leggere error."

  acceptance_criteria:
    - id: AC-503-1
      given: "body 'not-json' inviato con sessione adeguata a POST /api/auth/register, PATCH /api/auth/config, PATCH /api/admin/users/[id] e PATCH /api/settings/branding"
      when: "si invocano i quattro route handler"
      then: "ciascuno risponde 400 con code 'INVALID_JSON' e nessuno risponde 500"
    - id: AC-503-2
      given: "prisma.user.create forzato a lanciare un Error con messaggio che contiene 'db.example.supabase.co:5432'"
      when: "si chiama POST /api/auth/register con dati validi e header x-request-id 'req-test-0001'"
      then: "la risposta è 500 con code 'INTERNAL_ERROR' e requestId 'req-test-0001', il body non contiene 'supabase', 'prisma' né righe di stack, e console.error è chiamato una volta con un argomento che contiene 'req-test-0001'"
    - id: AC-503-3
      given: "root admin autenticato e utente esistente 'mario@example.test' (emendato da T-1401 il 2026-10-07: identità via email)"
      when: "invia POST /api/admin/users per creare di nuovo 'mario@example.test' e poi un utente con nome mostrato di 61 caratteri"
      then: "la prima risposta è 409 con code 'EMAIL_TAKEN' e la seconda è 400 con code 'VALIDATION_ERROR' (oggi entrambe 500)"
    - id: AC-503-4
      given: "root admin autenticato e upsert su app_settings forzato a lanciare un errore Prisma imprevisto"
      when: "invia PATCH /api/settings/branding con un appName valido"
      then: "la risposta è 500 con code 'INTERNAL_ERROR' e il body non contiene il messaggio dell'errore Prisma (oggi 400 con il messaggio interno)"

  target_tests:
    - file: "tests/integration/api-errors.test.ts"
      covers: [AC-503-1, AC-503-2, AC-503-3, AC-503-4]

  security_notes:
    - "OWASP A10:2025 Mishandling of Exceptional Conditions — CWE-209 (messaggi d'errore con informazioni sensibili): oggi auth/register restituisce error.message di qualunque eccezione con 400, inclusi i messaggi Prisma con l'host del DB; dopo il task il client riceve solo messaggi di AppError scritti apposta."
    - "CWE-755: request.json() malformato oggi produce 500 in tutte le route; mappato a 400 INVALID_JSON."
    - "OWASP A09:2025 Security Logging and Alerting Failures — CWE-778 e CWE-117: ogni 500 lascia una riga di log con requestId e stack lato server, così il requestId mostrato all'utente permette di ritrovare l'errore; il requestId è accettato dall'header solo se conforme al pattern, altrimenti rigenerato."

  out_of_scope:
    - "Logger strutturato e x-request-id assegnato dal proxy (T-602)."
    - "Traduzione dei codici lato client (T-1303)."
    - "Errori dei flussi OAuth Google (T-906)."

- id: T-504
  title: "Hash password asincrono e tempi di login uniformi"
  macrotask: "auth-hardening"
  depends_on: [T-404]

  objective: >
    Sostituire scryptSync con crypto.scrypt asincrono in lib/security/password.ts,
    mantenendo compatibili gli hash esistenti, e fare in modo che il login con username
    inesistente costi lo stesso calcolo di una password errata, eliminando
    l'enumerazione degli account via tempi di risposta.

  definition_of_done:
    - "lib/security/password.ts: hashPassword e verifyPassword diventano async e usano crypto.scrypt (callback promisificata, eseguita nel threadpool di libuv) invece di scryptSync; formato 'scrypt' + salt + hash separati dal carattere dollaro, base64url, salt 16 byte, chiave 64 byte e parametri di default di Node invariati, così gli hash già salvati si verificano senza migrazione."
    - "Confronto con timingSafeEqual dopo il controllo della lunghezza, come oggi; formato non riconosciuto restituisce false."
    - "Tutti i chiamanti aggiornati con await in lib/auth/credentials.ts: ensureLegacyDefaultUser, verifyLoginCredentials, registerUser, verifyUserPassword, updateAuthCredentials, updateUserAdminFields."
    - "verifyLoginCredentials: se lo username non esiste esegue comunque verifyPassword contro un hash fittizio costante calcolato una sola volta per processo e restituisce INVALID_CREDENTIALS; il ramo SUSPENDED resta valutato solo dopo una password corretta."
    - "Nessun uso residuo di scryptSync nel repo (ricerca = 0 righe)."

  acceptance_criteria:
    - id: AC-504-1
      given: "la password 'correct horse 42'"
      when: "si chiama hashPassword e poi verifyPassword con la stessa password e con 'wrong'"
      then: "l'hash è composto da 'scrypt', un salt di 22 caratteri base64url e un hash di 86 caratteri base64url separati dal dollaro, e le due verifiche restituiscono true e false"
    - id: AC-504-2
      given: "un hash generato dalla vecchia implementazione con scryptSync e salvato come fixture costante nel test"
      when: "si chiama verifyPassword con la password originale"
      then: "restituisce true"
    - id: AC-504-3
      given: "una callback setImmediate registrata subito dopo la chiamata a hashPassword"
      when: "la promise restituita da hashPassword si risolve"
      then: "la callback risulta già eseguita, a prova che il calcolo non ha bloccato l'event loop"
    - id: AC-504-4
      given: "utente 'anna' esistente e username 'nessuno' inesistente, con verifyPassword sotto spy"
      when: "si chiama POST /api/auth/login con 'anna' e password errata e poi con 'nessuno'"
      then: "entrambe le risposte sono 401 con body identico e verifyPassword è invocata esattamente una volta in ciascun caso"

  target_tests:
    - file: "tests/unit/password.test.ts"
      covers: [AC-504-1, AC-504-2, AC-504-3]
    - file: "tests/integration/login-uniform.test.ts"
      covers: [AC-504-4]

  security_notes:
    - "OWASP A07:2025 Authentication Failures — CWE-208 (differenza di tempo osservabile) e CWE-204: oggi uno username inesistente ritorna senza calcolare scrypt, rivelando quali account esistono; con la verifica sull'hash fittizio i due percorsi eseguono lo stesso calcolo e la stessa risposta."
    - "OWASP A06:2025 Insecure Design — CWE-400: scryptSync blocca l'event loop di Node per ogni login, registrazione e cambio password, rendendo facile saturare un'istanza con poche richieste parallele; crypto.scrypt sposta il lavoro nel threadpool."
    - "OWASP A04:2025 Cryptographic Failures — CWE-916: i parametri di costo restano quelli attuali per compatibilità; un eventuale aumento con rehash al login va confrontato con l'OWASP Password Storage Cheat Sheet ed è fuori scope."

  out_of_scope:
    - "Rate limiting del login (T-1701)."
    - "Aumento dei parametri di costo e rehash progressivo."

- id: T-505
  title: "Header di sicurezza HTTP e CSP a nonce"
  macrotask: "auth-hardening"
  depends_on: [T-404]

  objective: >
    Aggiungere gli header di sicurezza a tutte le risposte tramite next.config.ts e una
    Content-Security-Policy con nonce per richiesta generata nel proxy, secondo la guida
    ufficiale CSP di Next.js, senza rompere script, stili, font e logo del branding.

  definition_of_done:
    - "next.config.ts headers() su tutte le rotte: X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy che disattiva camera, microphone, geolocation, payment e usb, X-Frame-Options DENY (per browser senza frame-ancestors); poweredByHeader false (nessun header X-Powered-By); Strict-Transport-Security max-age=63072000 con includeSubDomains solo quando VERCEL_ENV vale production."
    - "proxy.ts: per le richieste di pagina (escluse /api, _next/static, _next/image, favicon e prefetch, come nel matcher della guida CSP di Next.js) genera un nonce per richiesta da crypto.randomUUID e imposta Content-Security-Policy sia sulla richiesta inoltrata (Next.js ne estrae il nonce e lo applica ai propri script) sia sulla risposta, insieme a x-nonce; il controllo di autenticazione esistente resta invariato."
    - "lib/security/csp.ts: funzione pura buildCsp(nonce, isDev) con le direttive della guida ufficiale: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic' più 'unsafe-eval' solo in sviluppo; style-src 'self' 'nonce-…'; img-src 'self' blob: data: https: (logo del branding remoto, solo https da T-506); font-src 'self' (next/font/google serve i font dal dominio dell'app); connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests."
    - "Stile inline: components/onboarding-progress-header.tsx usa style={{ width }} (unico attributo style del repo), che style-src con nonce bloccherebbe; sostituito con un elemento progress o con classi, oppure con style-src-attr dichiarato in modo esplicito, scelta motivata nel commit."
    - "Requisito dei nonce rispettato: layout e pagine sono già dinamici (export const dynamic = 'force-dynamic'); ogni nuova pagina resta dinamica."

  acceptance_criteria:
    - id: AC-505-1
      given: "build di produzione avviata"
      when: "lo spec E2E richiede GET /login e GET /api/auth/session (emendato da T-1101 il 2026-10-06: GET /api/health al posto della rotta rimossa)"
      then: "entrambe le risposte hanno X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, X-Frame-Options DENY, un Permissions-Policy che contiene camera=() e nessun header X-Powered-By"
    - id: AC-505-2
      given: "due richieste consecutive a /login sulla build di produzione"
      when: "lo spec legge gli header Content-Security-Policy e l'HTML grezzo delle risposte"
      then: "entrambi gli header contengono frame-ancestors 'none' e un nonce, i due nonce sono diversi e ogni tag script dell'HTML grezzo porta un attributo nonce uguale a quello del proprio header"
    - id: AC-505-3
      given: "browser E2E con listener sugli eventi securitypolicyviolation e sulla console"
      when: "si navigano /login, dashboard, una pagina risultati e una pagina dell'onboarding da utente loggato"
      then: "il numero di violazioni CSP registrate è 0"
    - id: AC-505-4
      given: "buildCsp('abc', false) e buildCsp('abc', true)"
      when: "il test analizza la direttiva script-src delle due stringhe"
      then: "in produzione contiene 'nonce-abc' e 'strict-dynamic' e non contiene 'unsafe-eval' né 'unsafe-inline'; in sviluppo contiene anche 'unsafe-eval'"

  target_tests:
    - file: "tests/e2e/security-headers.spec.ts"
      covers: [AC-505-1, AC-505-2, AC-505-3]
    - file: "tests/unit/csp.test.ts"
      covers: [AC-505-4]

  security_notes:
    - "OWASP A02:2025 Security Misconfiguration — CWE-1021 (clickjacking): next.config.ts oggi è vuoto e nessuna risposta porta header di protezione; frame-ancestors 'none' più X-Frame-Options DENY."
    - "OWASP A05:2025 Injection — CWE-79: CSP a nonce con 'strict-dynamic' come difesa in profondità contro XSS; nonce nuovo per ogni richiesta da crypto.randomUUID (CWE-330 se fosse prevedibile o riutilizzato)."
    - "CWE-693: X-Content-Type-Options nosniff anche su /api e sugli export scaricati, per impedire il MIME sniffing dei file generati."

  out_of_scope:
    - "Subresource Integrity sperimentale."
    - "connect-src per l'invio a Sentry (T-601)."
    - "Cross-Origin-Opener-Policy e Cross-Origin-Embedder-Policy."

- id: T-506
  title: "Branding: validazione completa, atomica e riservata al root admin"
  macrotask: "auth-hardening"
  depends_on: [T-503]

  objective: >
    Rendere il salvataggio del branding globale atomico, validato interamente lato
    server (limite di 100 KB per i logo inline, solo https e percorsi locali sicuri) e
    modificabile solo dal root admin, invece che da qualunque ADMIN.

  definition_of_done:
    - "PATCH /api/settings/branding richiede il root admin (requireRootAdminUserFromRequest): un ADMIN non root riceve 403 FORBIDDEN; GET resta disponibile agli admin; in app/admin/page.tsx la card del branding è modificabile solo dal root admin e in sola lettura per gli altri."
    - "lib/integrations/branding.ts updateBrandingSettings: valida tutti i campi PRIMA di qualsiasi scrittura (ValidationError di T-503 con il nome del campo) e scrive upsert e delete delle chiavi APP_BRAND_* in un'unica prisma.$transaction; se un campo è invalido nessuna riga di app_settings cambia (oggi appName viene salvato e poi il logo fallisce)."
    - "normalizeLogoUrl accetta solo: URL assoluti https con host; percorsi locali che iniziano con una sola barra seguita da un carattere diverso da barra e backslash e che non contengono backslash; data URL base64 di tipo image/png, image/jpeg, image/webp o image/svg+xml. Rifiuta http:, URL che iniziano con due barre, barra seguita da backslash, javascript: e data: di altri tipi."
    - "Limiti server: data URL con contenuto decodificato fino a 100 KB (102400 byte), altri URL fino a 2048 caratteri, appName da 1 a 80 caratteri senza caratteri di controllo."
    - "components/branding-settings-card.tsx: limite client allineato a 100 KB (oggi 350 KB), messaggio coerente e attributo accept limitato ai tipi ammessi."
    - "getBrandingSnapshot ignora in lettura i valori già salvati non conformi (es. http:), usando il nome e il logo predefiniti, senza errori di pagina."

  acceptance_criteria:
    - id: AC-506-1
      given: "root admin autenticato e APP_BRAND_NAME già salvato con valore 'Vecchio'"
      when: "invia PATCH /api/settings/branding con appName 'Nuovo' e logoUrlDark 'http://example.com/l.png'"
      then: "la risposta è 400 con code 'VALIDATION_ERROR' e la riga APP_BRAND_NAME, decifrata, vale ancora 'Vecchio'"
    - id: AC-506-2
      given: "root admin autenticato"
      when: "invia PATCH con logoUrl data:image/png;base64 da 102401 byte decodificati e poi da 102400 byte"
      then: "la prima risposta è 400 con code 'VALIDATION_ERROR' e la seconda è 200 con logoUrl valorizzato nello snapshot"
    - id: AC-506-3
      given: "root admin autenticato"
      when: "invia PATCH con logoUrl pari a '//evil.example/x.png', 'javascript:alert(1)', 'data:text/html;base64,PGI+' e 'https://cdn.example.com/logo.png'"
      then: "le prime tre risposte sono 400 e l'ultima è 200"
    - id: AC-506-4
      given: "utente ADMIN non root autenticato"
      when: "invia PATCH /api/settings/branding con un appName valido"
      then: "riceve 403 con code 'FORBIDDEN' e il numero e il contenuto delle righe APP_BRAND_* di app_settings restano invariati"

  target_tests:
    - file: "tests/integration/branding.test.ts"
      covers: [AC-506-1, AC-506-2, AC-506-3, AC-506-4]

  security_notes:
    - "OWASP A01:2025 Broken Access Control — CWE-269 (gestione impropria dei privilegi): il branding è globale e oggi qualunque ADMIN lo modifica; il controllo root-only è applicato nella route, non solo nascondendo la card."
    - "OWASP A06:2025 Insecure Design — CWE-770: un data URL senza limite server finisce nell'HTML di ogni pagina tramite TopNav nel layout; limite di 100 KB applicato nel server e scrittura in un'unica transazione per non lasciare stati parziali."
    - "CWE-829 e CWE-319: un logo da URL che inizia con due barre o da http: carica risorse da origini non controllate o in chiaro; ammessi solo https e percorsi locali. Il logo resta in un tag img (gli SVG caricati in img non eseguono script) e la CSP di T-505 ammette img-src https:."

  out_of_scope:
    - "Cache del branding per richiesta (T-1105)."
    - "Titolo della pagina dal nome del branding (T-1104)."
    - "Registro delle modifiche admin (T-1704)."

- id: T-507
  title: "Dashboard admin: errori corretti, conteggi coerenti, paginazione, ricerca con debounce"
  macrotask: "auth-hardening"
  depends_on: [T-503]

  objective: >
    Rendere la gestione utenti della dashboard admin coerente: totali limitati al
    perimetro che l'attore può gestire, lista paginata con ordinamento stabile al posto
    di take 500, errori di validazione e duplicati con status giusti, azioni su se stessi
    con un messaggio esplicito, ricerca con debounce e annullamento delle richieste.

  definition_of_done:
    - "lib/admin/users.ts listAdminUsers: parametri page (minimo 1) e pageSize (default 50, massimo 100), ordinamento is_root_admin desc, created_at desc, id desc; risposta {users, totals, page, pageSize, total}; rimosso take 500."
    - "Totali coerenti con il perimetro: per l'admin non root il perimetro è SUBSCRIBER e totalAdmins vale null invece di contare tutti gli admin (oggi lo spread di baseWhere viene sovrascritto da role ADMIN); invariante totalUsers = totalActive + totalSuspended."
    - "searchText troncato a 100 caratteri lato server; filtro case-insensitive invariato."
    - "updateUserFromAdmin e deleteUserFromAdmin: il controllo «stesso utente» viene eseguito PRIMA di assertCanManageTarget e risponde 400 con code SELF_ACTION_FORBIDDEN e un messaggio unico; i rami oggi irraggiungibili («Non puoi sospendere…», «Non puoi rimuovere…», «Non puoi eliminare…») rimossi."
    - "Errori tramite AppError e withApiErrors (T-503): validazione di username e password a 400, username duplicato a 409 (oggi 500)."
    - "components/admin-users-dashboard.tsx: ricerca con debounce di 300 ms e AbortController (la richiesta precedente viene annullata quando ne parte una nuova); controlli di paginazione con totale; cambio di filtro ruolo o stato riporta a pagina 1."

  acceptance_criteria:
    - id: AC-507-1
      given: "DB con 3 ADMIN (incluso il root) e 5 SUBSCRIBER di cui 1 sospeso, attore ADMIN non root"
      when: "chiama GET /api/admin/users"
      then: "totals vale totalUsers 5, totalSubscribers 5, totalAdmins null, totalActive 4, totalSuspended 1 e users contiene solo utenti con role SUBSCRIBER"
    - id: AC-507-2
      given: "119 SUBSCRIBER più il root admin (120 utenti) e attore root"
      when: "richiede page 1, 2 e 3 con pageSize 50 e poi page 1 con pageSize 1000"
      then: "le tre pagine contengono 50, 50 e 20 utenti senza id ripetuti, total vale 120 e la richiesta con pageSize 1000 restituisce pageSize 100 e 100 utenti"
    - id: AC-507-3
      given: "attore ADMIN, in un caso root e in un altro non root"
      when: "esegue PATCH con status SUSPENDED e DELETE sul proprio id"
      then: "ogni richiesta riceve 400 con code 'SELF_ACTION_FORBIDDEN' e il record dell'attore resta invariato sul DB"
    - id: AC-507-4
      given: "AdminUsersDashboard montato con fetch mockato e timer finti"
      when: "si digitano 6 caratteri a 50 ms l'uno dall'altro e si avanzano i timer di 300 ms"
      then: "oltre al caricamento iniziale fetch è chiamato una sola volta con searchText uguale al testo completo, e il signal di una richiesta ancora in corso quando ne parte una nuova risulta aborted"

  target_tests:
    - file: "tests/integration/admin-users.test.ts"
      covers: [AC-507-1, AC-507-2, AC-507-3]
    - file: "tests/component/admin-users-search.test.tsx"
      covers: [AC-507-4]

  security_notes:
    - "OWASP A01:2025 Broken Access Control — CWE-200: oggi un admin non root vede il numero totale degli admin, fuori dal suo perimetro; i totali sono calcolati solo sul perimetro gestibile. Le azioni restano protette lato server da requireAdminUserFromRequest e assertCanManageTarget (CWE-285)."
    - "OWASP A06:2025 Insecure Design — CWE-770: lista con take 500 e una raffica di query a ogni tasto; paginazione con massimo 100, ricerca limitata a 100 caratteri, debounce e annullamento delle richieste superate."
    - "OWASP A05:2025 Injection — CWE-89: la ricerca usa il filtro parametrizzato contains di Prisma, nessuna query SQL composta a mano."

  out_of_scope:
    - "Registro delle azioni amministrative (T-1704)."
    - "Cruscotto KPI (T-1705)."
    - "Riduzione del numero di query dei totali (T-1105)."
```

## Dipendenze implicite (non nel DAG, da confermare)

- T-501 legge `APP_SESSION_SECRET` dalla env validata di `lib/env.ts` (T-201), che non è a monte di T-404 nel DAG; il vincolo è soddisfatto se 02-environments è costruito prima di questo macrotask.
- T-502 e T-503 condividono la funzione che mappa `AuthRequiredError` a 401 `AUTH_REQUIRED`: chi arriva per primo la crea, l'altro la riusa.

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
