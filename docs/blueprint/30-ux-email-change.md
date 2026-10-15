# 30-ux-email-change — Macrotask `ux-email-change`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 3 di 7: l'utente cambia da sé l'email dell'account, con un link di conferma al nuovo indirizzo (funzione A1 del brainstorming del 2026-10-14).

## Obiettivo del macrotask
Oggi l'email dell'account non si cambia: né l'utente né l'admin hanno un modo per farlo. Dopo questo modulo:

- **Richiesta**: nella sezione Profilo, «Cambia email» chiede la nuova email e la password attuale e manda un link di conferma al nuovo indirizzo, valido 24 ore. Finché il link non si apre l'email resta quella di prima e il Profilo mostra «In attesa di conferma» con «Annulla».
- **Conferma**: il link apre una pagina pubblica che cambia l'email, la segna verificata e avvisa il vecchio indirizzo.
- **Senza invio delle email** (D-11, Resend non ancora configurato): il pulsante è spento e una riga dice di chiedere il cambio all'amministratore (modulo 34).

## Task atomici

```yaml
- id: T-3001
  title: "Richiesta e conferma del cambio email"
  macrotask: "ux-email-change"
  depends_on: [T-2802, T-1401, T-1402, T-1403]

  objective: >
    Aggiungere la richiesta di cambio email con un token monouso inviato al nuovo indirizzo e la sua conferma, con le
    stesse protezioni della verifica dell'email (T-1403).

  definition_of_done:
    - "Migrazione additiva 0044_email_change_tokens: tabella email_change_tokens (id, user_id con ON DELETE CASCADE, new_email, token_hash char(64) univoco, created_at, expires_at, used_at) con indice su user_id; modello Prisma EmailChangeToken."
    - "lib/email/index.ts: isEmailDeliveryAvailable(), vera con EMAIL_TRANSPORT outbox o con Resend configurato (getResendSettings non nullo)."
    - "lib/account/email-change.ts e POST /api/account/email { newEmail, currentPassword }: password attuale obbligatoria (400 CURRENT_PASSWORD_REQUIRED, 401 CURRENT_PASSWORD_INVALID); email normalizzata (400 EMAIL_INVALID; 400 EMAIL_UNCHANGED se uguale a quella attuale); 503 EMAIL_UNAVAILABLE se isEmailDeliveryAvailable() è falsa; limite di frequenza per utente con consumeRateLimit (5 richieste l'ora, poi 429); le richieste precedenti non usate dell'utente diventano usate; token da 32 byte di crypto.randomBytes salvato solo come sha256, scadenza 24 ore; template email-change verso il nuovo indirizzo, nella lingua dell'utente, con il link APP_PUBLIC_URL/email-change?token=…; risposta 202. Se il nuovo indirizzo è già di un altro utente la risposta è la stessa 202, ma non nasce il token e non parte nessuna email."
    - "DELETE /api/account/email (Annulla): segna come usate le richieste in attesa dell'utente e risponde 204; getPendingEmailChange(userId) restituisce new_email ed expires_at della richiesta valida, mai token o hash."
    - "POST /api/auth/email-change/confirm { token } (pubblica, in PUBLIC_PATHS di proxy.ts accanto a /api/auth/verify-email): token valido, non usato e non scaduto → nella stessa transazione users.email = new_email, email_verified_at = adesso e used_at = adesso, risposta 200; indirizzo preso da un altro utente nel frattempo → 409 EMAIL_TAKEN senza modifiche; token sconosciuto, usato o scaduto → 410 EMAIL_CHANGE_INVALID con la stessa risposta in tutti i casi; dopo la conferma, se isEmailDeliveryAvailable(), template email-changed al vecchio indirizzo (senza link e senza il nuovo indirizzo)."
    - "Template email-change ed email-changed in it ed en in lib/email/templates, registrati in RENDERERS."

  acceptance_criteria:
    - id: AC-3001-1
      given: "l'utente U con email a@example.com, password P ed EMAIL_TRANSPORT outbox"
      when: "invia POST /api/account/email con { newEmail: 'B@Example.com', currentPassword: P }"
      then: "la risposta è 202; email_change_tokens ha 1 riga di U con new_email 'b@example.com', token_hash di 64 caratteri esadecimali ed expires_at uguale a created_at più 24 ore; l'outbox ha 1 email verso b@example.com il cui link contiene un token con sha256 uguale a token_hash; users.email di U vale ancora a@example.com"
    - id: AC-3001-2
      given: "il token della richiesta di AC-3001-1"
      when: "si invia due volte POST /api/auth/email-change/confirm con quel token"
      then: "la prima risposta è 200, users.email vale b@example.com con email_verified_at non nullo e l'outbox ha 1 email email-changed verso a@example.com; la seconda risposta è 410 con code EMAIL_CHANGE_INVALID"
    - id: AC-3001-3
      given: "l'utente V con email c@example.com"
      when: "U invia POST /api/account/email con { newEmail: 'c@example.com', currentPassword: P }"
      then: "la risposta è 202 come in AC-3001-1, email_change_tokens non ha righe nuove e l'outbox non ha email verso c@example.com"
    - id: AC-3001-4
      given: "l'utente U"
      when: "invia la richiesta con currentPassword errata, poi con EMAIL_TRANSPORT resend senza RESEND_API_KEY ed EMAIL_FROM, poi 6 richieste valide di seguito"
      then: "le risposte sono 401 CURRENT_PASSWORD_INVALID, 503 EMAIL_UNAVAILABLE e, alla sesta richiesta valida, 429; le prime due non creano righe in email_change_tokens"
    - id: AC-3001-5
      given: "una richiesta in attesa di U con il suo token"
      when: "U invia DELETE /api/account/email e poi si conferma quel token"
      then: "la DELETE risponde 204, la conferma risponde 410 EMAIL_CHANGE_INVALID e users.email è invariato"

  target_tests:
    - file: "tests/integration/email-change.test.ts"
      covers: [AC-3001-1, AC-3001-2, AC-3001-3, AC-3001-4, AC-3001-5]

  security_notes:
    - "A07 / CWE-640: token da 32 byte (CWE-330), salvato solo come hash (CWE-312), monouso e con scadenza; la richiesta chiede la password attuale; la conferma passa dal nuovo indirizzo, quindi chi cambia l'email deve controllarlo."
    - "A01 / CWE-204: un indirizzo già usato non si distingue dalla risposta; avviso al vecchio indirizzo dopo la conferma; limite di frequenza contro l'invio massivo di email (CWE-799). Il token non compare in risposte o log (CWE-532)."

  out_of_scope:
    - "Cambio email da parte del root admin (T-3402); dispositivi collegati e verifica in due passaggi (lavoro futuro, D-41)."

- id: T-3002
  title: "Cambio email nel Profilo e pagina di conferma"
  macrotask: "ux-email-change"
  depends_on: [T-3001]

  objective: >
    Portare la richiesta e la conferma nell'interfaccia: la finestra «Cambia email» nel Profilo, lo stato «In attesa di
    conferma» con «Annulla» e la pagina pubblica che apre il link.

  definition_of_done:
    - "Sezione Profilo: «Cambia email» apre una finestra (ModalDialog) con Nuova email, Password attuale e «Manda il link di conferma»; dopo il 202 la finestra si chiude e la sezione mostra «In attesa di conferma: {email}» con la scadenza e «Annulla» (DELETE /api/account/email); con isEmailDeliveryAvailable() falsa il pulsante ha disabled e una riga spiega di chiedere il cambio all'amministratore; errori in un elemento role alert."
    - "Pagina pubblica /email-change (in PUBLIC_PATHS di proxy.ts e tra le pagine dei link delle email di components/top-nav.tsx): legge il token dall'indirizzo, chiama POST /api/auth/email-change/confirm e mostra l'esito (email cambiata con il link all'accesso, link non valido o scaduto, indirizzo già usato); /email-change in APP_AREAS di app/robots.ts."
    - "Stringhe in it ed en; i file nuovi in I18N_MIGRATED_FILES."

  acceptance_criteria:
    - id: AC-3002-1
      given: "la sezione Profilo con emailDeliveryAvailable false"
      when: "si rende"
      then: "il pulsante «Cambia email» ha l'attributo disabled e la riga d'aiuto con «amministratore» è visibile"
    - id: AC-3002-2
      given: "la sezione Profilo con emailDeliveryAvailable true e fetch simulato che risponde 202"
      when: "si apre «Cambia email», si scrivono 'b@example.com' e la password e si invia"
      then: "fetch è chiamato 1 volta con POST /api/account/email e corpo { newEmail: 'b@example.com', currentPassword }, l'elemento role dialog non c'è più e il testo «In attesa di conferma: b@example.com» è visibile con il pulsante «Annulla»"
    - id: AC-3002-3
      given: "una richiesta di cambio verso e2e-email-new@example.test creata nel DB di test per un utente dedicato, con il suo token"
      when: "si apre /email-change?token=… senza sessione"
      then: "la pagina risponde 200 e mostra l'esito «Email cambiata»; users.email dell'utente vale e2e-email-new@example.test; riaprire lo stesso indirizzo mostra l'esito del link non valido"

  target_tests:
    - file: "tests/component/email-change-section.test.tsx"
      covers: [AC-3002-1, AC-3002-2]
    - file: "tests/e2e/email-change.spec.ts"
      covers: [AC-3002-3]

  security_notes:
    - "A01 / CWE-598: il token viaggia nell'indirizzo della pagina come per la verifica dell'email (T-1403), è monouso e la pagina lo invia alla rotta con una POST; la pagina non lo ripete nel contenuto."

  out_of_scope:
    - "Cambio email senza invio delle email: lo fa il root admin (T-3402)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41): funzione A1 con il pulsante spento finché le email non partono (D-11).
- Migrazione additiva `0044_email_change_tokens`: il deploy di produzione la applica al merge.
- Gate umani: nessuno.
- Scelte dell'agente da confermare (rilievi): scadenza del link a 24 ore come la verifica dell'email; 5 richieste l'ora; un indirizzo già usato non si distingue nella risposta (l'utente non riceve il link); l'avviso al vecchio indirizzo non contiene il nuovo; dopo il cambio la sessione resta aperta.
- Note di costruzione (2026-10-15), scelte dell'agente da confermare dall'utente. T-3001: la richiesta controlla nell'ordine password, email e invio disponibile, poi consuma il limite di 5 l'ora (regola fissa `emailChange` in `rateLimitRules`, senza variabili d'ambiente), così le richieste rifiutate non contano; token, controllo dell'indirizzo già usato ed email partono dopo la risposta con `runAfterResponse`, come nella registrazione, quindi anche i tempi della risposta non cambiano; la risposta 202 porta `data` con il nuovo indirizzo e la scadenza, uguale anche per un indirizzo già usato; dopo la conferma i link di verifica e di recupero password ancora aperti (inviati al vecchio indirizzo) smettono di valere; l'avviso email-changed non ha pulsante né link e ha un piè di pagina suo, che non dice «puoi ignorarla» (`composeEmail` accetta `action` e `footer` facoltativi); vincolo CHECK sul minuscolo di `new_email` nella migrazione. Limite noto: in un indirizzo già usato non nasce la richiesta, quindi ricaricando il Profilo la riga «In attesa di conferma» non c'è più. T-3002: l'email esce dalla card «Profilo» e ha una card sua, «Email», con l'indirizzo, «Cambia email» e la richiesta in attesa (scadenza con data e ora, «Annulla»); la riga dell'amministratore compare solo con l'invio spento; la pagina /email-change invia il token da sola all'apertura, una volta sola, perché il link arriva al nuovo indirizzo e aprirlo è già la conferma (la verifica dell'email usa invece un pulsante); esiti «Email cambiata» con «Vai all'accesso», link non valido o scaduto, indirizzo già usato; /email-change anche tra le pagine con Referrer-Policy no-referrer di next.config.ts.
