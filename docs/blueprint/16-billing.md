# 16-billing — Macrotask `billing`

> Abbonamenti per workspace con Merchant of Record (Paddle Billing, D-06) e diritti configurabili (D-14); nasce dal piano di commercializzazione dell'audit 2026-10-02: oggi non esiste alcun modello di piano, nessun limite d'uso lato server e nessuna integrazione di pagamento.

## Obiettivo del macrotask
Dare al prodotto piani e limiti letti da un'unica configurazione (`lib/billing/plans.ts`), un checkout per workspace avviato solo dall'OWNER, uno stato dell'abbonamento alimentato esclusivamente da webhook firmati e idempotenti, una pagina di fatturazione con portale cliente, cambio piano, disdetta e gestione dei pagamenti scaduti, e l'applicazione dei diritti in ogni API che crea risorse o usa funzioni a pagamento. Il provider resta dietro l'interfaccia `BillingProvider` (D-06: Paddle proposto, Lemon Squeezy alternativa). Nessun prezzo, limite, durata di trial o periodo di tolleranza viene deciso qui: i valori arrivano da D-14. Tutto resta in pausa dietro l'interruttore del lancio commerciale (D-32, T-1606): finché il root admin non lo attiva gli utenti non hanno limiti, non si compra nulla e la registrazione pubblica è chiusa; D-14 serve solo per attivarlo.

## Fonti verificate (developer.paddle.com, 2026-10-02)
- Firma webhook: header `Paddle-Signature` nel formato `ts=<unix>;h1=<hex>`; payload firmato = `ts + ":" + corpo grezzo`; HMAC-SHA256 con il segreto della notification destination (prefisso `pdl_ntfset_`); più `h1` durante la rotazione del segreto; non trasformare il corpo; confronto a tempo costante; tolleranza predefinita 5 secondi — https://developer.paddle.com/webhooks/signature-verification
- Consegna: POST JSON con `event_id`, `event_type`, `occurred_at`, `notification_id`, `data`; consegna at-least-once, ordine non garantito (usare `occurred_at`); rispondere 200 entro 5 secondi; retry sandbox 3 in 15 minuti, live 60 in 3 giorni — https://developer.paddle.com/webhooks/about/how-webhooks-work/ , https://developer.paddle.com/webhooks/respond-to-webhooks
- Eventi subscription: created, updated, activated, trialing, past_due, paused, resumed, canceled, imported; stati `active`, `canceled`, `past_due`, `paused`, `trialing`; il payload esclude `management_urls` — https://developer.paddle.com/webhooks/subscriptions/subscription-updated/
- `custom_data`: JSON con almeno una chiave, copiato dalla transazione alla subscription creata — https://developer.paddle.com/api-reference/about/custom-data/
- Transazione lato server `POST /transactions` (items, customer_id, custom_data; `Authorization: Bearer <api key>`) e checkout con `Paddle.Checkout.open({ transactionId })`; richiede un default payment link approvato — https://developer.paddle.com/api-reference/transactions/create-transaction , https://developer.paddle.com/build/transactions/pass-transaction-checkout/
- Portale: `POST /customers/{customer_id}/portal-sessions` con `subscription_ids`; risposta `urls.general.overview` e deep link per subscription; link temporanei da non salvare né mettere in iframe — https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/
- Disdetta `POST /subscriptions/{id}/cancel` con `effective_from` = `next_billing_period` (default) o `immediately`; con disdetta programmata lo stato resta `active` fino a `scheduled_change.effective_at`, poi `subscription.canceled`; una subscription cancellata non si riattiva — https://developer.paddle.com/build/subscriptions/cancel-subscriptions
- Cambio piano `PATCH /subscriptions/{id}` con `items` e `proration_billing_mode` (anteprima su `/preview`) — https://developer.paddle.com/build/subscriptions/replace-products-prices-upgrade-downgrade
- Sandbox: base URL `https://sandbox-api.paddle.com` (live `https://api.paddle.com`), chiavi API sandbox con `sdbx`, client token sandbox con prefisso `test_`, account separato su sandbox-vendors.paddle.com, `Paddle.Environment.set("sandbox")` lato client — https://developer.paddle.com/sdks/sandbox/ , https://developer.paddle.com/paddle-js/methods/paddle-environment-set/
- Da verificare nel task: URL dello script Paddle.js per la CSP, comportamento del payment recovery a tentativi esauriti oltre a `subscription.canceled`, IP di invio dei webhook.

## Task atomici

```yaml
- id: T-1601
  title: "Piani e diritti configurabili"
  macrotask: "billing"
  depends_on: [T-1501]

  objective: >
    Creare l'unica fonte di verità di piani, prezzi visualizzati e limiti
    (lib/billing/plans.ts) e una risoluzione dei diritti per workspace che degrada sempre
    al piano free in caso di dato mancante o sconosciuto. I valori sono quelli di D-14;
    finché l'utente non li fornisce restano placeholder espliciti che disattivano gli
    acquisti.

  definition_of_done:
    - "lib/billing/plans.ts esporta PLANS: Record<PlanId, PlanConfig> con id, nameKey (chiave i18n), public (mostrato nella pagina prezzi), order, displayPrice per locale e intervallo (stringhe solo di visualizzazione), priceEnv (nomi delle variabili d'ambiente con i price id Paddle per intervallo) e limits: maxProjects, maxSectionsPerProject, maxSeedsPerSection, runsPerDay, maxKeywordsPerRun, keywordsPerMonth, licensedMetricsKeywordsPerMonth, seats (interi maggiori o uguali a 0) e sheetsExport, plannerImport, licensedMetrics (booleani). licensedMetrics abilita il fornitore di metriche con licenza (D-30, T-902); licensedMetricsKeywordsPerMonth è la quota mensile di keyword arricchite dal fornitore (T-1703)."
    - "keywordsPerMonth è aggiunto all'elenco dell'outline perché serve alle quote mensili di T-1703; licensedMetrics e licensedMetricsKeywordsPerMonth servono al fornitore di metriche con licenza (D-09, D-30)."
    - "Valori: tutti da D-14. Finché l'utente non li fornisce il file contiene placeholder dichiarati e PLANS_CONFIG_STATUS = 'placeholder-D14'; isPlansConfigured() restituisce false e viene rispettata dal checkout (T-1602) e dalla pagina prezzi (T-1802). Il task non inventa prezzi, limiti, trial né tolleranze."
    - "Schema zod nello stesso modulo valida PLANS al caricamento: chiave mancante, tipo errato o valore negativo → errore all'avvio con nome del piano e della chiave. Esiste sempre il piano free (FREE_PLAN_ID)."
    - "resolveEntitlements(snapshot, now) è una funzione pura: snapshot nullo → free; status active o trialing → limiti del plan_id; qualunque altro status → free (la tolleranza di past_due arriva con T-1604); plan_id sconosciuto → free e un log warning con il solo planId."
    - "getEntitlements(workspaceId) carica lo snapshot dell'abbonamento (fino a T-1603 non esiste e restituisce free) e chiama resolveEntitlements; con il lancio in pausa (D-32, T-1606) restituisce invece UNLIMITED_ENTITLEMENTS; setPlansForTesting(plans) sostituisce PLANS solo con NODE_ENV=test, così i test usano limiti noti senza dipendere da D-14."

  acceptance_criteria:
    - id: AC-1601-1
      given: "nessun abbonamento per il workspace"
      when: "si chiama resolveEntitlements(null, now)"
      then: "il risultato ha planId 'free' e limits deep-equal a PLANS.free.limits"
    - id: AC-1601-2
      given: "un piano di prova 'pro' impostato con setPlansForTesting"
      when: "si risolve uno snapshot con planId 'pro' per ciascuno degli status active, trialing, past_due, paused, canceled"
      then: "active e trialing restituiscono i limiti di 'pro'; past_due, paused e canceled restituiscono i limiti di 'free'"
    - id: AC-1601-3
      given: "uno snapshot con planId 'sconosciuto-x' e status active"
      when: "si chiama resolveEntitlements"
      then: "il risultato ha i limiti di 'free' e il logger warning è chiamato 1 volta con planId 'sconosciuto-x'"
    - id: AC-1601-4
      given: "una configurazione con maxProjects = -1 e un'altra senza la chiave seats"
      when: "si valida lo schema dei piani e si legge isPlansConfigured() con PLANS_CONFIG_STATUS 'placeholder-D14'"
      then: "entrambe le validazioni lanciano un errore il cui messaggio contiene nome del piano e chiave; isPlansConfigured() restituisce false"

  target_tests:
    - file: "tests/unit/entitlements.test.ts"
      covers: [AC-1601-1, AC-1601-2, AC-1601-3, AC-1601-4]

  security_notes:
    - "A06 Insecure Design / CWE-840 (Business Logic Errors): un'unica fonte di limiti per enforcement, pagina prezzi e checkout; status o piano sconosciuti degradano a free, mai a un piano a pagamento."
    - "A02 Security Misconfiguration / CWE-1188 (Initialization of a Resource with an Insecure Default): con valori placeholder gli acquisti restano disattivati, così non si incassa con prezzi non decisi."

  out_of_scope:
    - "Valori di prezzi, limiti, trial e tolleranza: D-14, forniti dall'utente."
    - "Tolleranza dei pagamenti scaduti: T-1604."
    - "Applicazione dei limiti nelle API: T-1605."

- id: T-1602
  title: "Checkout con Merchant of Record"
  macrotask: "billing"
  depends_on: [T-1601, T-1502, T-1606]

  objective: >
    Introdurre l'interfaccia BillingProvider con l'implementazione Paddle Billing e un
    checkout per workspace avviato solo dall'OWNER: la transazione viene creata lato
    server con workspace_id nei custom_data e il browser riceve solo l'id della
    transazione; sandbox per sviluppo e preview.

  definition_of_done:
    - "lib/billing/provider.ts: interfaccia BillingProvider (createCheckout, createPortalSession, cancelSubscription, changePlan) con tipi neutri; lib/billing/paddle.ts la implementa con fetch nativo verso l'API Paddle e header Authorization: Bearer con la API key."
    - "Env validata in lib/env.ts (T-201): PADDLE_ENV (sandbox o production), PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET (usato da T-1603), NEXT_PUBLIC_PADDLE_CLIENT_TOKEN e i price id elencati in priceEnv di lib/billing/plans.ts. Base URL derivata da PADDLE_ENV: https://sandbox-api.paddle.com oppure https://api.paddle.com; l'override PADDLE_API_BASE_URL è ammesso solo con NODE_ENV diverso da production (fake HTTP negli e2e)."
    - "Coerenza ambiente: le API key sandbox contengono 'sdbx' e i client token sandbox iniziano con 'test_'; una chiave sandbox con PADDLE_ENV=production o una chiave live con PADDLE_ENV=sandbox fa fallire la validazione all'avvio, con messaggio che nomina la variabile senza stamparne il valore."
    - "POST /api/billing/checkout con workspaceId, planId, interval: requireWorkspaceRole con azione billing.manage (solo OWNER); lancio in pausa (isCommercialLive() false, D-32) → 409 code BILLING_PAUSED; isPlansConfigured() false in production → 503 code PLANS_NOT_CONFIGURED; planId inesistente, free o senza price id per l'intervallo → 400 code INVALID_PLAN; workspace con abbonamento trialing, active, past_due o paused → 409 code SUBSCRIPTION_EXISTS (si passa dal cambio piano di T-1604). Un campo custom_data o price nel body viene ignorato."
    - "Transazione lato server: POST /transactions con items [price_id, quantity 1], custom_data con workspace_id e initiated_by_user_id, customer_id se il workspace ne ha già uno (record di T-1603, se presente); risposta 200 con transactionId."
    - "components/checkout-button.tsx: chiama l'endpoint e apre Paddle.Checkout.open con il solo transactionId; Paddle.js inizializzato con NEXT_PUBLIC_PADDLE_CLIENT_TOKEN e Paddle.Environment.set('sandbox') solo con PADDLE_ENV=sandbox. URL dello script Paddle.js e relativa voce nella CSP di T-505: da verificare nel task."
    - "Errori del provider (rete, 4xx, 5xx): 502 code BILLING_PROVIDER_ERROR senza il body di Paddle; log con status e requestId, mai la API key."
    - "Prerequisiti esterni (azioni dell'utente, registrate in SESSION-STATE): account sandbox su sandbox-vendors.paddle.com, prodotti e prezzi creati secondo D-14, default payment link approvato in Paddle > Checkout > Checkout settings."

  acceptance_criteria:
    - id: AC-1602-1
      given: "l'OWNER del workspace W, piani di prova configurati e Paddle mockato"
      when: "invia POST /api/billing/checkout con workspaceId W, planId 'pro', interval 'month' e un campo custom_data con workspace_id 'altro'"
      then: "la risposta è 200 con transactionId uguale a quello del mock; il mock ha ricevuto 1 POST /transactions con header Authorization 'Bearer' seguito dalla chiave di test, items[0].price_id uguale al price id configurato per pro mensile e custom_data.workspace_id uguale a W"
    - id: AC-1602-2
      given: "un ADMIN e un MEMBER di W e un utente non membro"
      when: "inviano la stessa richiesta di checkout"
      then: "ADMIN e MEMBER ricevono 403 con code FORBIDDEN, il non membro 404, e il mock Paddle ha ricevuto 0 richieste"
    - id: AC-1602-3
      given: "l'OWNER di W"
      when: "invia planId 'free', poi planId 'inesistente', poi planId 'pro' con W già su un abbonamento active"
      then: "le risposte sono 400 INVALID_PLAN, 400 INVALID_PLAN e 409 SUBSCRIPTION_EXISTS e il mock Paddle ha ricevuto 0 richieste"
    - id: AC-1602-4
      given: "PADDLE_ENV=sandbox per il primo caso e PADDLE_ENV=production con una PADDLE_API_KEY contenente 'sdbx' per il secondo"
      when: "il provider crea una transazione e poi si esegue la validazione env"
      then: "la richiesta del primo caso è diretta a https://sandbox-api.paddle.com/transactions; la validazione del secondo caso lancia un errore che nomina PADDLE_API_KEY e non contiene il valore della chiave"

  target_tests:
    - file: "tests/integration/billing-checkout.test.ts"
      covers: [AC-1602-1, AC-1602-2, AC-1602-3, AC-1602-4]

  security_notes:
    - "A08 Software or Data Integrity Failures / CWE-345 (Insufficient Verification of Data Authenticity): workspace_id in custom_data è scritto dal server dopo il controllo di ruolo; il browser riceve solo transactionId e non può legare un pagamento a un workspace altrui."
    - "A01 Broken Access Control / CWE-285 (Improper Authorization): solo l'OWNER avvia il checkout (billing.manage, D-08)."
    - "A02 Security Misconfiguration / CWE-798 (Use of Hard-coded Credentials) e CWE-532: API key solo da env validata, mai nel sorgente, nei log o nel bundle client; solo il client token NEXT_PUBLIC è pubblico per progetto di Paddle; mismatch sandbox/production bloccato all'avvio."

  out_of_scope:
    - "Webhook e stato dell'abbonamento: T-1603."
    - "Portale, cambio piano e disdetta: T-1604."
    - "Prezzi reali e trial: D-14."

- id: T-1603
  title: "Webhook firmati e stato dell'abbonamento"
  macrotask: "billing"
  depends_on: [T-1602]

  objective: >
    Ricevere gli eventi di Paddle su un endpoint pubblico che accetta solo richieste con
    firma HMAC valida e timestamp recente, li registra una sola volta per event_id e
    aggiorna lo stato dell'abbonamento del workspace con una macchina a stati che tollera
    consegne duplicate e fuori ordine.

  definition_of_done:
    - "prisma/schema.prisma: enum SubscriptionStatus (trialing, active, past_due, paused, canceled); model WorkspaceSubscription mappato su workspace_subscriptions (workspace_id @unique, provider, provider_subscription_id @unique, provider_customer_id, plan_id, status, current_period_start, current_period_end, cancel_at?, past_due_since?, currency_code?, recurring_amount_minor BigInt?, billing_interval?, billing_frequency?, quantity?, last_event_occurred_at, updated_at); model BillingEvent mappato su billing_events (event_id @unique, event_type, occurred_at, notification_id, outcome applied/stale/ignored, payload Json, created_at); RLS abilitata senza policy (T-205)."
    - "POST /api/billing/webhook aggiunto ai percorsi pubblici a match esatto del proxy (proxy.ts dopo T-404); nessuna sessione richiesta; il corpo grezzo si legge con request.text() prima di qualunque parse."
    - "lib/billing/paddle-signature.ts: parse di Paddle-Signature nel formato ts=<unix>;h1=<hex> con uno o più h1; payload firmato = ts + ':' + corpo grezzo; HMAC-SHA256 con PADDLE_WEBHOOK_SECRET; confronto con crypto.timingSafeEqual su buffer di pari lunghezza contro ogni h1; tolleranza su ts di 5 secondi (default Paddle), configurabile da env validata PADDLE_WEBHOOK_TOLERANCE_SECONDS con massimo 300."
    - "Firma assente, malformata, non corrispondente o ts fuori tolleranza → 401 con code INVALID_SIGNATURE, nessuna scrittura su DB e log warning senza corpo né header."
    - "Idempotenza: insert di BillingEvent per event_id nella stessa transazione dell'aggiornamento di stato; P2002 su event_id → 200 senza effetti (consegna at-least-once)."
    - "Ordine: un evento con occurred_at minore o uguale a last_event_occurred_at viene registrato con outcome stale e non modifica lo stato (Paddle non garantisce l'ordine)."
    - "Eventi gestiti: subscription.created, updated, activated, trialing, past_due, paused, resumed, canceled; altri tipi registrati come ignored. Mappatura: status da data.status; periodo da data.current_billing_period (starts_at, ends_at); cancel_at da data.scheduled_change.effective_at quando action = cancel, altrimenti null; plan_id dalla mappa inversa price id → piano di lib/billing/plans.ts (price sconosciuto → free e log); currency_code, billing_cycle (interval, frequency), items[0].price.unit_price.amount (stringa intera in unità minima) e items[0].quantity salvati per T-1705; past_due_since impostato alla prima transizione verso past_due e azzerato all'uscita."
    - "workspace_id da data.custom_data.workspace_id: assente, workspace inesistente o diverso dal workspace già legato a quel provider_subscription_id → outcome ignored, risposta 200 (per fermare i retry) e log error con event_id."
    - "Risposta entro i 5 secondi richiesti da Paddle: una sola transazione breve, nessuna chiamata di rete nel handler; errore DB → 500 così Paddle ritenta."
    - "getEntitlements (T-1601) legge workspace_subscriptions."

  acceptance_criteria:
    - id: AC-1603-1
      given: "workspace W, segreto di test e un payload subscription.created con custom_data.workspace_id W, status active, price id del piano pro e current_billing_period.ends_at T"
      when: "il test firma ts:corpo con HMAC-SHA256 e invia POST /api/billing/webhook con Paddle-Signature ts=<now>;h1=<firma>"
      then: "la risposta è 200; workspace_subscriptions ha 1 riga per W con status active, plan_id 'pro' e current_period_end = T; billing_events ha 1 riga con outcome applied; getEntitlements(W) restituisce i limiti di 'pro'"
    - id: AC-1603-2
      given: "lo stesso payload firmato"
      when: "si invia (a) con 1 byte del corpo modificato dopo la firma, (b) firmato con un segreto diverso, (c) con ts più vecchio della tolleranza, (d) senza header Paddle-Signature"
      then: "le quattro risposte sono 401 con code INVALID_SIGNATURE e billing_events e workspace_subscriptions hanno 0 righe"
    - id: AC-1603-3
      given: "un evento già elaborato per W e un secondo evento valido con custom_data.workspace_id W2 ma lo stesso provider_subscription_id"
      when: "il primo evento viene consegnato di nuovo con lo stesso event_id e poi arriva il secondo"
      then: "entrambe le risposte sono 200; billing_events contiene 1 riga per il primo event_id e 1 riga con outcome ignored per il secondo; workspace_subscriptions resta legata a W con updated_at invariato"
    - id: AC-1603-4
      given: "W in status active con last_event_occurred_at T1"
      when: "arriva subscription.past_due con occurred_at T2 maggiore di T1 e poi subscription.updated con status active e occurred_at compreso tra T1 e T2"
      then: "status resta past_due con past_due_since valorizzato e il secondo evento è registrato con outcome stale"

  target_tests:
    - file: "tests/integration/billing-webhook.test.ts"
      covers: [AC-1603-1, AC-1603-2, AC-1603-3, AC-1603-4]

  security_notes:
    - "A08 Software or Data Integrity Failures / CWE-347 (Improper Verification of Cryptographic Signature): nessun dato del webhook viene usato prima della verifica HMAC-SHA256 sul corpo grezzo; PADDLE_WEBHOOK_SECRET arriva da env validata, mai dal sorgente."
    - "A07 Authentication Failures / CWE-294 (Authentication Bypass by Capture-replay): tolleranza sul timestamp e idempotenza per event_id impediscono di riusare una consegna catturata."
    - "A04 Cryptographic Failures / CWE-208 (Observable Timing Discrepancy): confronto delle firme con crypto.timingSafeEqual."
    - "A01 Broken Access Control / CWE-639: il legame subscription → workspace non può essere spostato da un evento con custom_data diverso."
    - "A09 Security Logging and Alerting Failures / CWE-778 (Insufficient Logging): firme non valide ed eventi ignorati loggati con event_id e motivo, senza payload."

  out_of_scope:
    - "Pagina di fatturazione, portale e tolleranza past_due: T-1604."
    - "Elaborazione asincrona a coda: non necessaria finché la transazione resta sotto i 5 secondi."

- id: T-1604
  title: "Portale cliente, cambio piano, disdetta e pagamenti scaduti"
  macrotask: "billing"
  depends_on: [T-1603]

  objective: >
    Dare all'OWNER una pagina di fatturazione con piano, rinnovo, fatture e metodo di
    pagamento tramite il portale Paddle, cambio piano e disdetta a fine periodo; gestire i
    pagamenti scaduti con un banner e un periodo di tolleranza da D-14, e mantenere
    l'accesso fino a fine periodo dopo la disdetta.

  definition_of_done:
    - "Pagina /billing (app/billing/page.tsx) del workspace corrente (getCurrentWorkspace di T-1502): piano, status, prossimo rinnovo (current_period_end), disdetta programmata (cancel_at); tutti i membri la vedono, le azioni (checkout di T-1602, portale, cambio piano, disdetta) sono rese solo all'OWNER e verificate lato server."
    - "POST /api/billing/portal con workspaceId (OWNER): POST /customers/{provider_customer_id}/portal-sessions con subscription_ids [provider_subscription_id]; risposta 200 con url = urls.general.overview e i deep link della subscription (update_subscription_payment_method, cancel_subscription), header Cache-Control: no-store; i link non vengono salvati né loggati e si aprono in una nuova scheda, mai in iframe."
    - "POST /api/billing/change-plan con workspaceId, planId, interval (OWNER): PATCH /subscriptions/{id} con items [price_id del nuovo piano, quantity 1] e proration_billing_mode letto da lib/billing/plans.ts (valore da D-14); 400 INVALID_PLAN se il piano coincide con l'attuale, non è pubblico o è free; lo stato locale cambia solo con il webhook subscription.updated."
    - "POST /api/billing/cancel con workspaceId (OWNER): POST /subscriptions/{id}/cancel con effective_from next_billing_period; lo status resta active fino a scheduled_change.effective_at (mostrato come cancel_at) e poi arriva subscription.canceled; una subscription cancellata non si riattiva (nuovo checkout)."
    - "Pagamenti scaduti: resolveEntitlements di T-1601 esteso: status past_due mantiene i limiti del piano finché now è minore di past_due_since + PAST_DUE_GRACE (costante in lib/billing/plans.ts, valore da D-14), poi free; banner in app/layout.tsx per i membri del workspace corrente in past_due con data di fine tolleranza e link al metodo di pagamento solo per l'OWNER."
    - "Riepilogo d'uso: se T-1703 è già costruito la pagina monta components/usage-summary.tsx; altrimenti lo monta T-1703."
    - "e2e: Paddle sostituito da un fake HTTP locale tramite PADDLE_API_BASE_URL (ammesso solo fuori da production); gli stati di abbonamento sono seminati direttamente in workspace_subscriptions."

  acceptance_criteria:
    - id: AC-1604-1
      given: "l'OWNER e un MEMBER di W con abbonamento active e Paddle mockato"
      when: "l'OWNER invia POST /api/billing/portal e poi il MEMBER invia la stessa richiesta"
      then: "l'OWNER riceve 200 con url uguale a urls.general.overview del mock e header Cache-Control no-store; il mock ha ricevuto 1 POST /customers/{customer}/portal-sessions con subscription_ids [sub]; nessuna tabella contiene l'url restituito; il MEMBER riceve 403"
    - id: AC-1604-2
      given: "W in past_due con past_due_since = now - (PAST_DUE_GRACE - 1 ora) nel primo caso e now - (PAST_DUE_GRACE + 1 ora) nel secondo"
      when: "si chiama getEntitlements(W) e un membro apre la dashboard"
      then: "nel primo caso i limiti sono quelli del piano pagato e la pagina contiene l'elemento con data-testid billing-past-due-banner; nel secondo i limiti sono quelli di free"
    - id: AC-1604-3
      given: "l'OWNER di W con abbonamento active e Paddle mockato"
      when: "invia POST /api/billing/cancel e in seguito arriva il webhook subscription.updated con scheduled_change action cancel ed effective_at X"
      then: "il mock ha ricevuto 1 POST /subscriptions/{sub}/cancel con effective_from next_billing_period; prima del webhook lo status locale è ancora active; dopo il webhook /billing mostra la data X e getEntitlements restituisce ancora i limiti del piano pagato"
    - id: AC-1604-4
      given: "l'OWNER di W sul piano pro e un MEMBER di W"
      when: "l'OWNER invia POST /api/billing/change-plan verso un altro piano pubblico e il MEMBER apre /billing"
      then: "il mock ha ricevuto 1 PATCH /subscriptions/{sub} con items[0].price_id del nuovo piano e proration_billing_mode uguale a quello configurato; il MEMBER vede nome del piano e data di rinnovo e 0 elementi con data-testid billing-action"

  target_tests:
    - file: "tests/integration/billing-portal.test.ts"
      covers: [AC-1604-1, AC-1604-2, AC-1604-3, AC-1604-4]
    - file: "tests/e2e/billing-page.spec.ts"
      covers: [AC-1604-2, AC-1604-3, AC-1604-4]

  security_notes:
    - "A01 Broken Access Control / CWE-285 (Improper Authorization): portale, cambio piano e disdetta riservati all'OWNER via requireWorkspaceRole con billing.manage; la UI nasconde i pulsanti ma la verifica è lato server."
    - "A02 Security Misconfiguration / CWE-524 (Use of Cache Containing Sensitive Information) e CWE-532: i link del portale contengono un token temporaneo, quindi non vengono salvati né loggati e la risposta è no-store."
    - "A06 Insecure Design / CWE-840 (Business Logic Errors): lo stato locale cambia solo da webhook firmati (T-1603), mai dalla risposta al client o da parametri di ritorno del checkout."

  out_of_scope:
    - "Rimborsi e note di credito: gestiti dal Merchant of Record nella dashboard Paddle."
    - "Quote d'uso e contatori: T-1703."

- id: T-1605
  title: "Applicazione dei diritti lato server"
  macrotask: "billing"
  depends_on: [T-1601, T-1502, T-1503, T-902, T-1606]

  objective: >
    Verificare nelle API ogni limite di conteggio e ogni funzione a pagamento del piano del
    workspace, rispondendo 402 con code PLAN_LIMIT e il nome del limite, senza mai fidarsi
    di dati del client e senza superare il limite con richieste concorrenti; la UI mostra
    l'invito all'upgrade.

  definition_of_done:
    - "lib/billing/enforce.ts: assertWithinLimit(tx, workspaceId, limitKey, currentCount), assertFeature(workspaceId, featureKey) e assertSeatAvailable(tx, workspaceId) lanciano PlanLimitError, tradotto dal wrapper errori di T-503 in 402 con error, code PLAN_LIMIT, limit (nome della chiave) e max."
    - "Punti di controllo: POST /api/projects (maxProjects per workspace); POST /api/projects/[id]/subprojects e creazione sezione dell'onboarding (maxSectionsPerProject); seed in POST progetto, PATCH sezione e step seed dell'onboarding (maxSeedsPerSection, contati dopo la deduplica); avvio estrazione (maxKeywordsPerRun passato alla pipeline come tetto: keyword oltre il tetto non salvate, result.truncated = true); POST /api/projects/[id]/export/google-sheets (sheetsExport); import CSV Planner di T-905 se presente (plannerImport); metriche con licenza (licensedMetrics): scegliere il provider DATAFORSEO in creazione o modifica di progetto o sezione senza il diritto risponde 402, e all'avvio dell'estrazione un workspace senza il diritto usa il provider NONE senza chiamate al fornitore, con result.metricsNotice = PLAN_NO_LICENSED_METRICS."
    - "Seats: assertSeatAvailable conta membership e inviti pendenti; se T-1503 è già costruito viene chiamata da creazione e accettazione invito, altrimenti l'aggancio lo fa T-1503."
    - "Conteggio e scrittura nella stessa transazione con lock della riga del workspace (SELECT ... FOR UPDATE), così richieste concorrenti non superano il limite."
    - "Il piano arriva solo da getEntitlements(workspaceId) lato server: campi plan, limits o entitlements nel body, nella query o negli header vengono ignorati."
    - "lib/client/http.ts riconosce 402 PLAN_LIMIT e mostra l'invito all'upgrade (link a /billing per l'OWNER, testo che invita a contattare l'owner per gli altri ruoli) con stringhe dei cataloghi it/en."
    - "Dopo un downgrade i dati oltre limite restano leggibili e modificabili; si bloccano solo nuove creazioni oltre il limite."

  acceptance_criteria:
    - id: AC-1605-1
      given: "W su un piano di prova con maxProjects = 2 e 2 progetti esistenti"
      when: "un MEMBER invia POST /api/projects con un body che contiene anche plan 'pro' e limits con maxProjects 999"
      then: "la risposta è 402 con code PLAN_LIMIT, limit 'maxProjects' e max 2; i progetti di W restano 2"
    - id: AC-1605-2
      given: "W con 1 progetto e maxProjects = 2"
      when: "si inviano 2 POST /api/projects concorrenti"
      then: "esattamente una risposta è 201 e una è 402 PLAN_LIMIT; i progetti di W sono 2"
    - id: AC-1605-3
      given: "W su un piano di prova con sheetsExport = false"
      when: "un membro invia POST /api/projects/{P}/export/google-sheets"
      then: "la risposta è 402 con limit 'sheetsExport' e il mock delle API Google ha ricevuto 0 richieste"
    - id: AC-1605-4
      given: "W su un piano di prova con maxSeedsPerSection = 3 e una sezione con 2 seed"
      when: "un membro invia PATCH della sezione con 4 seed distinti"
      then: "la risposta è 402 con limit 'maxSeedsPerSection' e max 3; la sezione ha ancora i 2 seed originali"
    - id: AC-1605-5
      given: "W su un piano di prova con licensedMetrics = false, una sezione con metrics_provider DATAFORSEO salvato prima del downgrade e il fetch del fornitore mockato"
      when: "un membro invia PATCH della sezione impostando metrics_provider DATAFORSEO su una seconda sezione e poi avvia l'estrazione sulla prima"
      then: "la PATCH risponde 402 con limit 'licensedMetrics'; l'estrazione si completa, il mock del fornitore ha ricevuto 0 richieste e il result del job contiene metricsNotice uguale a PLAN_NO_LICENSED_METRICS"

  target_tests:
    - file: "tests/integration/entitlements-enforcement.test.ts"
      covers: [AC-1605-1, AC-1605-2, AC-1605-3, AC-1605-4, AC-1605-5]

  security_notes:
    - "A06 Insecure Design / CWE-602 (Client-Side Enforcement of Server-Side Security): limiti verificati solo lato server da getEntitlements; la UI è informativa."
    - "A06 / CWE-362 (Race Condition): conteggio e insert sotto lock della riga workspace."
    - "A01 Broken Access Control / CWE-284: l'enforcement avviene dopo requireWorkspaceRole, quindi un non membro riceve 404 e non scopre piano né limiti del workspace."

  out_of_scope:
    - "Quote per periodo (estrazioni al giorno, keyword al mese): T-1703."
    - "Valori dei limiti: D-14."

- id: T-1606
  title: "Interruttore del lancio commerciale"
  macrotask: "billing"
  depends_on: [T-1601, T-1105, T-507]

  objective: >
    Tenere in pausa tutto ciò che è commerciale finché il root admin non decide di lanciare (D-32): in pausa gli
    utenti non hanno limiti né quote, non si compra nulla e la registrazione pubblica è chiusa; un interruttore nel
    pannello admin attiva tutto solo quando la checklist di configurazione è verde, e si può rispegnere.

  definition_of_done:
    - "lib/billing/launch.ts: stato del lancio paused o live in app_settings (chiave COMMERCIAL_LAUNCH_STATUS), letto con la cache dati di T-1105 (tag dedicato, invalidato a ogni cambio); assente o illeggibile → paused (fail-safe). Esporta getLaunchStatus(), isCommercialLive() e getLaunchChecklist()."
    - "Checklist calcolata solo lato server, senza mai mostrare valori segreti: plans (isPlansConfigured() di T-1601), paddle (PADDLE_ENV, PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN e i price id dei piani pubblici presenti e coerenti, T-1602), email (RESEND_API_KEY ed EMAIL_FROM presenti, D-11), legal (testi di T-1803 presenti con status diverso da placeholder e versione uguale a LEGAL_TERMS_VERSION), captcha (TURNSTILE_SECRET_KEY e NEXT_PUBLIC_TURNSTILE_SITE_KEY presenti e non di test in production, T-1702). Una voce il cui task non è ancora costruito risulta mancante, mai verde."
    - "Effetti della pausa: getEntitlements di T-1601 restituisce UNLIMITED_ENTITLEMENTS (limiti di conteggio null, cioè illimitati; sheetsExport e plannerImport attivi; licensedMetrics invariato, del solo root admin come da T-902) qualunque sia l'abbonamento; checkout, cambio piano e portale di T-1602 e T-1604 rispondono 409 code BILLING_PAUSED; la pagina prezzi di T-1802 mostra pricing.comingSoon; la registrazione pubblica risponde 403 code SIGNUP_DISABLED anche con APP_PUBLIC_SIGNUP_ENABLED=true; gli utenti creati dal root admin dal pannello nascono con email_verified_at valorizzato (l'admin garantisce l'indirizzo; senza Resend la verifica via email non arriverebbe). Con live valgono piani, abbonamenti, limiti, quote e APP_PUBLIC_SIGNUP_ENABLED."
    - "API: GET /api/admin/launch (solo root admin) → status, checklist con ok per voce, changedAt, changedBy; PATCH /api/admin/launch con status live o paused (solo root admin): live con almeno una voce mancante → 409 code LAUNCH_NOT_READY con missing (nomi delle voci) e stato invariato; altro utente → 403 FORBIDDEN. Ogni cambio scrive una riga di log con attore, stato precedente e nuovo (nel registro di T-1704 se già costruito)."
    - "components/admin-launch-card.tsx nella pagina /admin, visibile solo al root admin: stato attuale, checklist con l'esito di ogni voce e il task o la variabile che la soddisfa, pulsante «Attiva il lancio» disabilitato finché una voce manca e pulsante per rimettere in pausa, con conferma; testi nei cataloghi it/en (T-1302)."
    - "I task successivi leggono solo isCommercialLive(): T-1602 e T-1604 (409 BILLING_PAUSED), T-1605 e T-1703 (nessun 402 né 429 in pausa, perché i diritti sono illimitati e le quote non si applicano), T-1702 (CAPTCHA richiesto solo con registrazione pubblica aperta), T-1801 e T-1802 (CTA di registrazione e prezzi solo con live)."

  acceptance_criteria:
    - id: AC-1606-1
      given: "nessuna riga COMMERCIAL_LAUNCH_STATUS in app_settings e un workspace senza abbonamento"
      when: "si legge getLaunchStatus() e si chiama getEntitlements(workspaceId)"
      then: "lo stato è paused e i diritti hanno tutti i limiti di conteggio null con sheetsExport e plannerImport true"
    - id: AC-1606-2
      given: "lancio in pausa con APP_PUBLIC_SIGNUP_ENABLED=true"
      when: "un anonimo invia POST /api/auth/register con dati validi e il root admin crea un utente dal pannello admin"
      then: "la registrazione risponde 403 con code SIGNUP_DISABLED e users non ha la nuova email; l'utente creato dal root admin ha email_verified_at non nullo"
    - id: AC-1606-3
      given: "lancio in pausa e PLANS_CONFIG_STATUS uguale a 'placeholder-D14'"
      when: "il root admin invia PATCH /api/admin/launch con status live, e un admin non root invia la stessa richiesta"
      then: "la prima risposta è 409 con code LAUNCH_NOT_READY e missing che contiene 'plans'; la seconda è 403 con code FORBIDDEN; lo stato resta paused"
    - id: AC-1606-4
      given: "checklist interamente soddisfatta con configurazione di test (piani validi con setPlansForTesting e variabili d'ambiente fittizie) e un workspace senza abbonamento"
      when: "il root admin attiva il lancio, poi lo rimette in pausa"
      then: "dopo l'attivazione GET /api/admin/launch riporta status live e getEntitlements restituisce i limiti del piano free; dopo la pausa lo stato è paused e i diritti tornano illimitati"

  target_tests:
    - file: "tests/integration/commercial-launch.test.ts"
      covers: [AC-1606-1, AC-1606-2, AC-1606-3, AC-1606-4]

  security_notes:
    - "A01 Broken Access Control / CWE-285 (Improper Authorization): stato e checklist si leggono e si cambiano solo come root admin; nessun parametro del client cambia i diritti."
    - "A02 Security Misconfiguration / CWE-1188 (Insecure Default Initialization of Resource): stato assente o illeggibile vale paused; l'attivazione richiede la checklist verde, così non si vende senza webhook firmati, email, testi legali o CAPTCHA."
    - "A04 Cryptographic Failures / CWE-200 (Exposure of Sensitive Information): la checklist dice solo se una variabile è presente e coerente, mai il suo valore."
    - "A06 Insecure Design / CWE-799 (Improper Control of Interaction Frequency): in pausa la registrazione pubblica è chiusa, quindi i diritti illimitati valgono solo per account creati dal root admin o invitati."

  out_of_scope:
    - "Valori di piani, prezzi, limiti, trial e tolleranza: D-14 (servono solo per attivare)."
    - "Configurazione degli account esterni (Paddle, Resend, Cloudflare Turnstile) e redazione dei testi legali (D-15): azioni dell'utente prima dell'attivazione."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Semantico: `self-check-checklist.md` punti 6-10.
- Emendamento del 2026-10-08 (D-32, decisione dell'utente): T-1606 aggiunge l'interruttore del lancio commerciale; T-1602 e T-1605 ne dipendono; D-14 non blocca più la costruzione. T-1604 legge isCommercialLive() tramite T-1602 (stessa risposta 409 BILLING_PAUSED).
- Rilievi da confermare nel 00-INDEX: `keywordsPerMonth` aggiunto ai limiti di T-1601 (serve a T-1703); seats agganciati agli inviti da chi arriva per secondo tra T-1503 e T-1605; riepilogo d'uso montato da chi arriva per secondo tra T-1604 e T-1703.
