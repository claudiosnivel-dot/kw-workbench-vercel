# 14-accounts-email — Macrotask `accounts-email`

> Identità basata sull'email, email transazionali (D-11), verifica dell'indirizzo, recupero password self-service e consenso versionato: nasce dai rilievi dell'audit 2026-10-02 su account identificati solo da username, assenza di qualunque canale email, nessun recupero password se non tramite reset da admin e nessuna traccia del consenso a termini e privacy.

## Obiettivo del macrotask

Oggi la tabella users ha solo `username` (unico, minuscolo, 3-40 caratteri) e password; il root admin è determinato dal nome 'admin' o dal primo utente creato (lib/auth/credentials.ts `ensureRootAdminExists`, `ensureLegacyDefaultUser` con i default `APP_AUTH_USERNAME`/`APP_AUTH_PASSWORD`); la registrazione (app/api/auth/register/route.ts, components/register-form.tsx) non raccoglie email né consenso; non esiste invio di email.
Il macrotask porta l'email a identità primaria (unica senza distinzione di maiuscole, verificabile), introduce un'interfaccia `EmailSender` con Resend in produzione e outbox in sviluppo/test (D-11), aggiunge verifica dell'email e recupero password con token monouso salvati solo come hash, e registra la versione dei termini accettata con riaccettazione al cambio di versione. I testi legali non sono scritti dall'agente (D-15).

## Emendamento 2026-10-07 (costruzione del macrotask)

T-1401 e T-1403 si costruiscono nella stessa sessione, quindi la risposta transitoria 409 `EMAIL_TAKEN` della
registrazione pubblica non viene mai pubblicata: la registrazione risponde sempre 202 `CHECK_EMAIL` (T-1403) e il 409
`EMAIL_TAKEN` resta nella creazione utente dell'admin (`POST /api/admin/users`), dove non c'è rischio di enumerazione.
AC-1401-1 verifica quindi l'unicità senza distinzione di maiuscole su entrambe le rotte e AC-1405-1 attende il 202 di
T-1403 invece del 200. Il root admin creato dal bootstrap con la tabella users vuota ha una password casuale mai
comunicata (niente più `APP_AUTH_USERNAME` e `APP_AUTH_PASSWORD`): il primo accesso passa dal recupero password di
T-1404. Gli AC dei macrotask precedenti scritti sullo username sono emendati negli stessi termini: AC-201-4 (bootstrap
con `APP_ADMIN_EMAIL`) e AC-503-3 (409 `EMAIL_TAKEN` per l'email già registrata, 400 `VALIDATION_ERROR` per un nome
mostrato non valido). Il design non cambia.

**Secondo emendamento 2026-10-07 (D-11 emendata, decisione dell'utente):** Resend si configura alla fine del blueprint.
In produzione `EMAIL_TRANSPORT` resta `resend` (l'outbox resta rifiutato, AC-1402-4) e `APP_PUBLIC_URL` resta
obbligatoria; `RESEND_API_KEY` ed `EMAIL_FROM` diventano facoltative, ma vanno impostate insieme. Senza, ogni invio
fallisce subito con `EmailDeliveryError` registrato come gli altri fallimenti (template, id, dominio), l'app parte e il
nuovo invio dell'email di verifica risponde 503 `EMAIL_UNAVAILABLE`.

## Vincoli di piattaforma verificati (2026-10-02)

- Resend, Node SDK: `const { data, error } = await resend.emails.send({ from, to, subject, html, text, headers, tags })`, successo con `data.id`; l'header `Idempotency-Key` evita invii duplicati, massimo 256 caratteri, scade dopo 24 h (https://resend.com/docs/api-reference/emails/send-email). Pacchetto `resend` alla versione 6.32.0 su npm alla data.
- `after()` di `next/server` esegue la callback dopo l'invio della risposta anche nei Route Handler (https://nextjs.org/docs/app/api-reference/functions/after): usato in T-1404 per rendere il tempo di risposta indipendente dall'esistenza dell'account.

## Task atomici

```yaml
- id: T-1401
  title: "Identità via email"
  macrotask: "accounts-email"
  depends_on: [T-501, T-201]

  objective: >
    Passare da username a email come identità di accesso: email unica senza
    distinzione di maiuscole e minuscole, stato di verifica, login con email,
    username rinominato in display_name non univoco; il root admin iniziale è
    determinato da APP_ADMIN_EMAIL invece che dal nome 'admin' o dal primo
    utente creato.

  definition_of_done:
    - "Migrazione: users.email (text, unique, nullable solo per gli utenti legacy), vincolo CHECK users_email_lowercase (email = lower(email)), users.email_verified_at (timestamp nullable); colonna username rinominata display_name con rimozione del vincolo unico; schema.prisma allineato (email String? @unique, display_name String)."
    - "lib/auth/credentials.ts: normalizeEmail (trim, minuscolo, massimo 254 caratteri, forma local@dominio con almeno un punto nel dominio, nessun CR/LF); registerUser({ email, displayName, password }) con display_name di default uguale alla parte locale dell'email; verifyLoginCredentials(email, password) cerca per email normalizzata; USERNAME_PATTERN e validateUsername sostituiti da validateDisplayName (1-60 caratteri)."
    - "Root admin: ensureRootAdminExists e il bootstrap a tabella users vuota usano APP_ADMIN_EMAIL (aggiunta allo schema di lib/env.ts di T-201, macrotask precedente; obbligatoria in produzione) al posto di ROOT_ADMIN_USERNAME 'admin', APP_AUTH_USERNAME e APP_AUTH_PASSWORD; prisma/seed.ts assegna APP_ADMIN_EMAIL al root admin con email nulla impostando email_verified_at, in modo idempotente."
    - "Utenti legacy senza email (D-05: solo dati di test): restano nel DB ma non possono accedere; docs/ENVIRONMENTS.md (T-203, macrotask precedente) lo documenta insieme a APP_ADMIN_EMAIL."
    - "POST /api/auth/register accetta { email, displayName, password, confirmPassword }: email non valida -> 400 { code: 'EMAIL_INVALID' }; email già registrata -> 409 { code: 'EMAIL_TAKEN' } (risposta transitoria: T-1403 la sostituisce con una risposta uniforme che non rivela se l'email esiste). POST /api/auth/login accetta { email, password } e risponde 401 { code: 'INVALID_CREDENTIALS' } con corpo identico per email inesistente e password errata."
    - "UI: components/login-form.tsx e components/register-form.tsx con campo email (type email, autocomplete email), display name opzionale in registrazione; components/top-nav.tsx e il pannello admin mostrano display_name ed email; lib/admin/users.ts cerca per email e display_name e la creazione utente da admin richiede l'email."
    - "Il token di sessione resta quello minimale di T-501 (uid, ver, iat, exp): nessuna email nel cookie."

  acceptance_criteria:
    - id: AC-1401-1
      given: "un utente registrato con POST /api/auth/register ed email 'Mario.Rossi@Example.COM', e un root admin autenticato"
      when: "si registra un secondo account con 'mario.rossi@example.com' con POST /api/auth/register e poi il root admin lo crea con POST /api/admin/users (emendato il 2026-10-07: la registrazione pubblica risponde già con il 202 di T-1403)"
      then: "la registrazione risponde 202 con code 'CHECK_EMAIL', la creazione dell'admin risponde 409 con code 'EMAIL_TAKEN', la tabella users contiene 1 sola riga con email 'mario.rossi@example.com'"
    - id: AC-1401-2
      given: "l'utente 'mario.rossi@example.com' con password nota"
      when: "si invia POST /api/auth/login con ' MARIO.ROSSI@example.com ' e la password corretta, poi con password errata, poi con un'email inesistente"
      then: "la prima risposta ha status 200 e un header Set-Cookie per kwb_session; la seconda e la terza hanno status 401 con corpo JSON identico byte per byte"
    - id: AC-1401-3
      given: "la tabella users vuota e APP_ADMIN_EMAIL='root@example.test'"
      when: "il bootstrap e prisma/seed.ts vengono eseguiti due volte di seguito"
      then: "esiste esattamente 1 utente con is_root_admin=true, email 'root@example.test' ed email_verified_at valorizzato, e il numero totale di utenti è 1"
    - id: AC-1401-4
      given: "il database di test migrato"
      when: "si esegue un INSERT SQL diretto in users con email 'Upper@Example.com'"
      then: "Postgres rifiuta l'inserimento con SQLSTATE 23514 (violazione del vincolo users_email_lowercase)"

  target_tests:
    - file: "tests/integration/email-identity.test.ts"
      covers: [AC-1401-1, AC-1401-2, AC-1401-3, AC-1401-4]

  security_notes:
    - "A07 Authentication Failures / CWE-204 (Observable Response Discrepancy): il login risponde con status e corpo identici per email inesistente e password errata; l'uniformità dei tempi è di T-504."
    - "A07 Authentication Failures / CWE-204, rischio residuo TRANSITORIO: fino a T-1403 la registrazione con email già usata risponde 409 EMAIL_TAKEN (enumerazione possibile); T-1403 lo chiude con una risposta 202 identica per email nuove ed esistenti."
    - "A02 Security Misconfiguration / CWE-1188 e CWE-798: in produzione APP_ADMIN_EMAIL è obbligatoria e il bootstrap non usa più i default 'admin' e 'changeme'; nessuna credenziale di default nel sorgente."
    - "A05 Injection / CWE-93: normalizeEmail rifiuta CR e LF, così l'indirizzo non può iniettare header nelle email di T-1402."

  out_of_scope:
    - "Verifica dell'email (T-1403), recupero password (T-1404), consenso (T-1405)."
    - "Workspace personale alla registrazione (T-1501)."

- id: T-1402
  title: "Email transazionali con outbox e template IT/EN"
  macrotask: "accounts-email"
  depends_on: [T-1301, T-201]

  objective: >
    Introdurre l'invio di email transazionali dietro l'interfaccia EmailSender,
    con implementazione Resend in produzione (D-11) e outbox senza rete in
    sviluppo e test, retry limitati e idempotenti, e template di verifica,
    reset password, invito e avvisi di billing in italiano e inglese.

  definition_of_done:
    - "lib/email/types.ts: EmailMessage { id, to, template, locale, subject, html, text } e interfaccia EmailSender { send(message): Promise<{ providerId: string }> }; errore tipizzato EmailDeliveryError."
    - "lib/email/resend-sender.ts: usa il pacchetto resend (versione esatta in package.json) con emails.send e mittente EMAIL_FROM; header Idempotency-Key uguale a EmailMessage.id, così i ritentativi non duplicano l'invio."
    - "Retry: al massimo 2 ritentativi (3 tentativi totali) solo per errori di rete, 429 e 5xx, con attesa crescente; nessun ritentativo per errori 4xx di validazione; dopo l'ultimo fallimento un solo console.error con template, id del messaggio e dominio del destinatario (mai indirizzo completo, chiave API, corpo o link) e EmailDeliveryError propagato al chiamante."
    - "lib/email/outbox-sender.ts: implementazione senza rete che salva i messaggi in memoria (test unitari) o nella tabella email_outbox (sviluppo e test d'integrazione; nuova migrazione con id, to_address, template, locale, subject, html, text, created_at)."
    - "lib/email/index.ts: getEmailSender() sceglie con EMAIL_TRANSPORT (resend oppure outbox) dallo schema di lib/env.ts; in produzione EMAIL_TRANSPORT deve valere resend e APP_PUBLIC_URL (introdotta da T-1203, macrotask precedente) è obbligatoria, altrimenti la validazione all'avvio fallisce (T-201); RESEND_API_KEY ed EMAIL_FROM si impostano insieme e, finché mancano (D-11 emendata il 2026-10-07), ogni invio fallisce subito come non configurato."
    - "lib/email/templates/: verify-email, password-reset, workspace-invite, billing-notice; ognuno espone render(locale, vars) che restituisce { subject, html, text } con testi nel namespace emails di messages/it.json e messages/en.json; variabili interpolate con escape HTML; link costruiti solo da APP_PUBLIC_URL; la lingua è users.ui_locale (T-1301) con fallback it."
    - "I contenuti di billing-notice restano segnaposto con variabili (piano, data) finché D-14 non fissa piani e periodi; nessun testo legale definitivo (D-15)."

  acceptance_criteria:
    - id: AC-1402-1
      given: "ResendEmailSender con il client resend mockato che restituisce error con statusCode 503 per due volte e poi data con id 're_123'"
      when: "viene inviato un messaggio con id 'msg-1'"
      then: "emails.send è chiamato 3 volte, tutte con Idempotency-Key 'msg-1', e il risultato ha providerId 're_123'"
    - id: AC-1402-2
      given: "ResendEmailSender con il client mockato che restituisce sempre 503 in un caso e 422 nell'altro, e RESEND_API_KEY='re_test_secret'"
      when: "viene inviato un messaggio a 'utente@example.com' in ciascun caso"
      then: "con 503 le chiamate sono 3, con 422 la chiamata è 1; in entrambi i casi viene lanciato EmailDeliveryError e console.error è chiamato una volta con un testo che contiene 'example.com' ma non 're_test_secret' né 'utente@'"
    - id: AC-1402-3
      given: "il template verify-email con displayName '<script>x</script>' e APP_PUBLIC_URL='https://app.example.test'"
      when: "viene reso in locale en e in locale it"
      then: "l'html contiene '&lt;script&gt;' e non contiene '<script>', il link inizia con 'https://app.example.test/verify-email?token=', e i due subject sono uguali ai valori en e it della chiave emails.verify.subject"
    - id: AC-1402-4
      given: "EMAIL_TRANSPORT=outbox in memoria e fetch globale mockato"
      when: "viene inviato un messaggio e poi viene validato un ambiente con NODE_ENV=production ed EMAIL_TRANSPORT=outbox"
      then: "fetch ha 0 chiamate e l'outbox contiene 1 messaggio con lo stesso to e template; la validazione dell'ambiente di produzione fallisce con un errore che nomina EMAIL_TRANSPORT"

  target_tests:
    - file: "tests/unit/email-sender.test.ts"
      covers: [AC-1402-1, AC-1402-2, AC-1402-3, AC-1402-4]

  security_notes:
    - "A02 Security Misconfiguration / CWE-798 e CWE-532: RESEND_API_KEY letta dall'env validata, mai nel sorgente né nei log; in produzione il trasporto outbox è rifiutato all'avvio."
    - "A05 Injection / CWE-79 e CWE-93: escape HTML delle variabili nei template; destinatario e subject rifiutano CR e LF."
    - "A07 Authentication Failures / CWE-640: i link nelle email sono costruiti solo da APP_PUBLIC_URL e mai dall'header Host, così un attaccante non può far puntare i link con token a un proprio dominio."
    - "A03 Software Supply Chain Failures / CWE-1104: la dipendenza resend è fissata a versione esatta e coperta dall'oracolo dependency-vuln (D-02)."

  out_of_scope:
    - "Invio delle email di verifica e reset (T-1403, T-1404), inviti (T-1503) e avvisi di billing (T-1604)."
    - "Configurazione DNS del dominio mittente (SPF, DKIM) su Resend: azione dell'utente, documentata in docs/ENVIRONMENTS.md."

- id: T-1403
  title: "Verifica dell'email alla registrazione"
  macrotask: "accounts-email"
  depends_on: [T-1401, T-1402, T-1204]

  objective: >
    Verificare il possesso dell'email alla registrazione con un token casuale
    monouso, salvato solo come hash e valido 24 ore; l'utente non verificato può
    accedere ma non può avviare estrazioni né checkout; il reinvio è limitato.
    La registrazione risponde in modo identico per email nuove ed esistenti, così
    non rivela quali indirizzi hanno già un account.

  definition_of_done:
    - "Migrazione: tabella email_verification_tokens (id, user_id FK on delete cascade, token_hash char(64) unique, expires_at, used_at nullable, created_at)."
    - "lib/auth/email-verification.ts: issueVerificationToken(userId) genera 32 byte con crypto.randomBytes codificati base64url, salva solo l'hash SHA-256 esadecimale con expires_at = adesso + 24 h, invalida i token non usati precedenti dell'utente e invia il template verify-email (T-1402) con link APP_PUBLIC_URL/verify-email?token=...; consumeVerificationToken(token) esegue in transazione un updateMany condizionale (token_hash, used_at nullo, expires_at futuro) e solo con count 1 imposta users.email_verified_at."
    - "POST /api/auth/register risponde sempre 202 { code: 'CHECK_EMAIL' } con corpo identico e senza cookie di sessione, sia per email nuova sia per email già registrata (sostituisce il 409 EMAIL_TAKEN transitorio di T-1401): con email nuova crea l'utente e chiama issueVerificationToken; con email esistente non modifica l'account e invia il nuovo template account-exists (lib/email/templates/, IT/EN, con link a login e a recupero password); un fallimento dell'invio è loggato ma non annulla la registrazione né cambia la risposta (l'utente può chiedere il reinvio). Il form di registrazione mostra 'Controlla la tua email' e rimanda al login."
    - "app/verify-email/page.tsx (pubblica) mostra un pulsante che invia il token con POST /api/auth/verify-email (pubblica): una semplice GET non consuma il token, così gli scanner dei link delle caselle di posta non lo bruciano; token valido -> 200; token inesistente, scaduto o già usato -> 400 { code: 'VERIFICATION_TOKEN_INVALID' } con corpo identico; header Referrer-Policy no-referrer sulla pagina."
    - "lib/auth/verified-email.ts requireVerifiedEmail(user): usato da app/api/projects/[id]/run/route.ts e app/api/projects/[id]/subprojects/[subprojectId]/run/route.ts (contratto 202 di T-1204, macrotask precedente) -> 403 { code: 'EMAIL_NOT_VERIFIED' }; T-1602 lo applicherà al checkout."
    - "POST /api/auth/verify-email/resend (sessione richiesta): massimo 1 invio ogni 60 s e 5 invii nelle ultime 24 h per utente, contati su email_verification_tokens.created_at; oltre -> 429 con header Retry-After in secondi; utente già verificato -> 409 { code: 'EMAIL_ALREADY_VERIFIED' }."
    - "Banner nel layout per utenti autenticati non verificati con pulsante di reinvio, testi nei cataloghi di T-1301."

  acceptance_criteria:
    - id: AC-1403-1
      given: "EMAIL_TRANSPORT=outbox e la tabella email_outbox vuota"
      when: "un visitatore si registra con 'nuovo@example.com'"
      then: "email_outbox contiene 1 messaggio verify-email per 'nuovo@example.com'; il token estratto dal link non compare in email_verification_tokens, dove token_hash è uguale allo SHA-256 esadecimale del token"
    - id: AC-1403-2
      given: "un token di verifica valido e un secondo token creato 24 h e 1 s prima dell'istante impostato con vi.setSystemTime"
      when: "si invia POST /api/auth/verify-email con il token valido due volte, poi con il token scaduto"
      then: "la prima risposta ha status 200 ed email_verified_at diventa non nullo; la seconda e la terza hanno status 400 con code 'VERIFICATION_TOKEN_INVALID' e corpo identico"
    - id: AC-1403-3
      given: "un utente autenticato con email non verificata e un progetto con una sezione con seed"
      when: "invia POST /api/projects/{id}/run e poi GET /api/user/preferences con la stessa sessione"
      then: "la POST risponde 403 con code 'EMAIL_NOT_VERIFIED' e la sezione ha 0 righe in jobs; la GET risponde 200 (l'accesso all'app resta consentito)"
    - id: AC-1403-4
      given: "un utente autenticato non verificato registrato 2 minuti prima, con 1 riga in email_verification_tokens"
      when: "chiede il reinvio, poi di nuovo dopo 10 s, poi altre 4 volte a intervalli di 61 s (tempo controllato con vi.setSystemTime)"
      then: "la prima risposta è 200, la seconda 429 con Retry-After tra 1 e 60; delle quattro successive le prime tre rispondono 200 e la quarta 429; email_verification_tokens contiene 5 righe per l'utente"
    - id: AC-1403-5
      given: "un utente esistente 'mario.rossi@example.com' con password_hash noto, EMAIL_TRANSPORT=outbox e la tabella email_outbox vuota"
      when: "si invia POST /api/auth/register con 'mario.rossi@example.com' e poi con 'nuovo2@example.com'"
      then: "entrambe le risposte hanno status 202 con corpo JSON identico byte per byte e nessun header Set-Cookie; password_hash di mario.rossi è invariato; email_outbox contiene 1 messaggio account-exists per 'mario.rossi@example.com' e 1 messaggio verify-email per 'nuovo2@example.com'"

  target_tests:
    - file: "tests/integration/email-verification.test.ts"
      covers: [AC-1403-1, AC-1403-2, AC-1403-3, AC-1403-4, AC-1403-5]

  security_notes:
    - "A07 Authentication Failures / CWE-640 e CWE-330: token da 32 byte con crypto.randomBytes, salvato solo come hash SHA-256 (un dump del DB non consente di verificare account), scadenza 24 h, monouso."
    - "A06 Insecure Design / CWE-367 (TOCTOU): il consumo del token è un updateMany condizionale atomico, due richieste concorrenti non possono usarlo entrambe."
    - "A07 Authentication Failures / CWE-204 (Observable Response Discrepancy): la registrazione risponde 202 con corpo identico per email nuove ed esistenti; il titolare reale riceve l'avviso account-exists. L'uniformità dei tempi di risposta si ottiene inviando l'email fuori dal percorso della risposta (after()) in entrambi i casi."
    - "A01 Broken Access Control / CWE-285: requireVerifiedEmail è applicato lato server nelle route di avvio estrazione; la UI non è l'unica barriera."
    - "A06 Insecure Design / CWE-799 (Improper Control of Interaction Frequency): limite di reinvio per utente; il rate limiting per IP è di T-1701. Token e link non compaiono nei log (A09, CWE-532)."

  out_of_scope:
    - "Recupero password (T-1404)."
    - "Rate limiting per IP e CAPTCHA (T-1701, T-1702)."
    - "Blocco del checkout (T-1602)."

- id: T-1404
  title: "Recupero password self-service"
  macrotask: "accounts-email"
  depends_on: [T-1403, T-504]

  objective: >
    Permettere all'utente di reimpostare la password da solo senza rivelare
    quali email sono registrate: richiesta con risposta identica, token monouso
    di 1 ora salvato come hash, reimpostazione che invalida tutte le sessioni
    attive incrementando session_version (T-501).

  definition_of_done:
    - "Migrazione: tabella password_reset_tokens (id, user_id FK on delete cascade, token_hash char(64) unique, expires_at, used_at nullable, created_at)."
    - "POST /api/auth/password-reset/request { email } (pubblica nel proxy): risponde sempre 202 { ok: true } con lo stesso corpo; ricerca dell'utente, creazione del token e invio del template password-reset avvengono in after(), così il tempo di risposta non dipende dall'esistenza dell'account; utenti inesistenti, legacy senza email o sospesi non ricevono email."
    - "Token: 32 byte casuali base64url, salvato solo l'hash SHA-256, scadenza 1 h, monouso; una nuova richiesta invalida (used_at valorizzato) i token non usati precedenti dello stesso utente; link APP_PUBLIC_URL/reset-password?token=..."
    - "POST /api/auth/password-reset/confirm { token, password, confirmPassword } (pubblica nel proxy): consumo con updateMany condizionale; token inesistente, scaduto o usato -> 400 { code: 'RESET_TOKEN_INVALID' } con corpo identico; password validata con validatePassword e hash asincrono di lib/security/password.ts (T-504, macrotask precedente); nella stessa transazione password_hash aggiornato, session_version incrementato ed email_verified_at impostato se nullo (il link prova il possesso dell'email)."
    - "Dopo il reset non viene emesso alcun cookie di sessione: l'utente accede con la nuova password."
    - "Pagine pubbliche app/forgot-password/page.tsx e app/reset-password/page.tsx con Referrer-Policy no-referrer; link 'Password dimenticata?' in components/login-form.tsx; testi nei cataloghi di T-1301."

  acceptance_criteria:
    - id: AC-1404-1
      given: "EMAIL_TRANSPORT=outbox, un utente attivo 'a@example.com' e nessun utente 'b@example.com'"
      when: "si invia la richiesta di reset per entrambe le email e si esegue il flush delle callback after()"
      then: "entrambe le risposte hanno status 202 con corpo identico byte per byte; email_outbox contiene 1 messaggio password-reset per 'a@example.com' e 0 per 'b@example.com'"
    - id: AC-1404-2
      given: "un utente con un cookie di sessione emesso prima del reset e un token di reset valido"
      when: "conferma il reset con una nuova password, poi usa il vecchio cookie su GET /api/user/preferences e prova il login con la vecchia e con la nuova password"
      then: "la conferma risponde 200 senza header Set-Cookie di sessione; il vecchio cookie riceve 401; il login con la vecchia password risponde 401 e con la nuova 200"
    - id: AC-1404-3
      given: "un token già usato, un token scaduto (vi.setSystemTime oltre 1 h e 1 s) e un token mai emesso"
      when: "si invia la conferma con ciascuno dei tre"
      then: "le tre risposte hanno status 400, code 'RESET_TOKEN_INVALID' e corpo identico, e password_hash dell'utente è invariato"
    - id: AC-1404-4
      given: "due richieste di reset consecutive per lo stesso utente"
      when: "si conferma prima con il token della prima richiesta e poi con quello della seconda"
      then: "la prima conferma risponde 400 'RESET_TOKEN_INVALID' e la seconda 200"

  target_tests:
    - file: "tests/integration/password-reset.test.ts"
      covers: [AC-1404-1, AC-1404-2, AC-1404-3, AC-1404-4]

  security_notes:
    - "A07 Authentication Failures / CWE-640 (Weak Password Recovery Mechanism): token da 32 byte, hash SHA-256, validità 1 h, monouso, invalidazione dei precedenti; link costruito da APP_PUBLIC_URL e mai dall'header Host (niente reset poisoning)."
    - "A07 Authentication Failures / CWE-204 e CWE-208 (Observable Timing Discrepancy): corpo e status identici per email esistenti e non, lavoro spostato in after()."
    - "A07 Authentication Failures / CWE-613 (Insufficient Session Expiration): il reset incrementa session_version e invalida tutti i token di sessione esistenti."
    - "A06 Insecure Design / CWE-799: rate limiting per email e IP demandato a T-1701 e CAPTCHA a T-1702, entrambi a valle di questo task."

  out_of_scope:
    - "Rate limiting e CAPTCHA (T-1701, T-1702)."
    - "Reset da admin con cambio password forzato e avviso email (T-1704)."

- id: T-1405
  title: "Consenso a termini e privacy con versione"
  macrotask: "accounts-email"
  depends_on: [T-1401]

  objective: >
    Richiedere l'accettazione di termini e privacy alla registrazione registrando
    versione e momento dell'accettazione; quando la versione cambia, l'utente
    deve riaccettare al primo accesso successivo prima di usare le pagine
    dell'app.

  definition_of_done:
    - "lib/legal/version.ts esporta LEGAL_TERMS_VERSION (stringa; valore iniziale segnaposto finché i testi di D-15 non sono forniti), da importare anche nelle pagine legali di T-1803."
    - "Migrazione: users.accepted_terms_version (text nullable) e users.accepted_terms_at (timestamp nullable)."
    - "POST /api/auth/register richiede acceptTerms=true e termsVersion uguale a LEGAL_TERMS_VERSION: acceptTerms assente o false -> 400 { code: 'TERMS_NOT_ACCEPTED' }; termsVersion diversa -> 409 { code: 'TERMS_VERSION_CHANGED' }; nessun utente creato in entrambi i casi; il server salva sempre la costante del server, mai il valore inviato dal client."
    - "components/register-form.tsx: checkbox obbligatoria con link a /terms e /privacy (pagine create da T-1803) e campo termsVersion valorizzato dal Server Component della pagina."
    - "Gate: helper requireCurrentTerms(user) in lib/legal/consent.ts, chiamato dal helper di autenticazione delle pagine, reindirizza a /accept-terms?next=percorso quando accepted_terms_version è diverso da LEGAL_TERMS_VERSION; POST /api/auth/login include requiresTermsAcceptance=true in quel caso e il form reindirizza a /accept-terms."
    - "app/accept-terms/page.tsx e POST /api/auth/accept-terms { termsVersion } (sessione richiesta): versione uguale alla corrente -> 200 con aggiornamento di accepted_terms_version e accepted_terms_at; altrimenti 409 TERMS_VERSION_CHANGED; il ritorno alla pagina richiesta usa safeNextPath di T-303."
    - "Le API JSON non sono bloccate dal gate (il gate riguarda le pagine); scelta documentata nel file lib/legal/consent.ts."

  acceptance_criteria:
    - id: AC-1405-1
      given: "un payload di registrazione valido"
      when: "viene inviato una volta senza acceptTerms e una volta con acceptTerms=true e termsVersion uguale a LEGAL_TERMS_VERSION"
      then: "il primo invio risponde 400 con code 'TERMS_NOT_ACCEPTED' senza nuove righe in users; il secondo risponde 202 (emendato il 2026-10-07: risposta di T-1403) e l'utente ha accepted_terms_version uguale a LEGAL_TERMS_VERSION e accepted_terms_at entro 5 s dall'istante della richiesta"
    - id: AC-1405-2
      given: "un payload di registrazione con acceptTerms=true e termsVersion='versione-vecchia'"
      when: "viene inviato a POST /api/auth/register"
      then: "la risposta ha status 409 con code 'TERMS_VERSION_CHANGED' e il numero di righe in users è invariato"
    - id: AC-1405-3
      given: "un utente con accepted_terms_version diverso da LEGAL_TERMS_VERSION"
      when: "esegue il login e poi viene invocato il gate delle pagine requireCurrentTerms con il suo utente e il percorso '/'"
      then: "il login risponde 200 con requiresTermsAcceptance=true; il gate produce il redirect di Next verso '/accept-terms?next=%2F'"
    - id: AC-1405-4
      given: "lo stesso utente autenticato"
      when: "invia POST /api/auth/accept-terms con termsVersion uguale a LEGAL_TERMS_VERSION e poi viene invocato di nuovo requireCurrentTerms con il percorso '/'"
      then: "la POST risponde 200, accepted_terms_version è uguale a LEGAL_TERMS_VERSION e il gate termina senza redirect"

  target_tests:
    - file: "tests/integration/terms-consent.test.ts"
      covers: [AC-1405-1, AC-1405-2, AC-1405-3, AC-1405-4]

  security_notes:
    - "A06 Insecure Design / CWE-602 (Client-Side Enforcement of Server-Side Security): accettazione verificata e versione salvata lato server con la costante del server; la checkbox del client non basta."
    - "A01 Broken Access Control / CWE-601 (Open Redirect): il ritorno da /accept-terms passa da safeNextPath di T-303."
    - "A09 Security Logging and Alerting Failures / CWE-778: versione e timestamp dell'accettazione sono registrati per utente come prova del consenso."

  out_of_scope:
    - "Testi legali (D-15) e pagine /terms, /privacy, /cookies (T-1803)."
    - "Esportazione e cancellazione dei dati dell'account (T-1804)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
