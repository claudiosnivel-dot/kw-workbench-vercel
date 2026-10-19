# 49-es-public — Macrotask `es-public`

> Spagnolo (D-47), modulo 3 di 5: workspace, amministrazione, email, sito pubblico e testi legali in spagnolo, le pagine pubbliche `/es` e `/es-419` con hreflang e sitemap, e l'accensione delle due lingue nei selettori.

## Obiettivo del macrotask
Dopo i moduli 47 e 48 resta da tradurre ciò che vedono i team, il root admin e i visitatori, poi si possono offrire le due lingue. Dopo questo modulo:

- **Cataloghi completi**: workspace, amministrazione, email, landing, prezzi, contatti e testi delle pagine legali; il controllo di parità vale per tutti i namespace.
- **Testi legali**: `content/legal/es/` con privacy, termini e cookie come segnaposto, come oggi per italiano e inglese (D-15).
- **Sito pubblico**: `/es` (es-ES) e `/es-419`, con hreflang fra le quattro lingue e la sitemap.
- **Accensione**: es-ES ed es-419 nei selettori della lingua, nelle preferenze dell'account e nel riconoscimento dal browser per i visitatori.

## Task atomici

```yaml
- id: T-4901
  title: "Workspace, amministrazione, email e testi pubblici in spagnolo"
  macrotask: "es-public"
  depends_on: [T-4802, T-1402, T-1803]

  objective: >
    Completare i cataloghi spagnoli con le aree dei team e del root admin, le email e i testi del sito pubblico.

  definition_of_done:
    - "messages/es-ES.json con i namespace workspace, admin, emails, marketing, pricing, legal e contact; messages/es-419.json con le sole differenze. Le email (T-1402) partono nella lingua del destinatario anche per es-ES ed es-419."
    - "content/legal/es/privacy.md, terms.md e cookies.md con status placeholder e la stessa struttura di quelli italiani, usati da es-ES ed es-419; npm run legal:check li controlla come gli altri."
    - "Controllo di parità di T-4702 su tutti i namespace dell'italiano."

  acceptance_criteria:
    - id: AC-4901-1
      given: "un utente con lingua es-419 che chiede il recupero della password"
      when: "si accoda l'email di recupero"
      then: "oggetto e testo dell'email sono quelli del catalogo es-419 (unione con es-ES) e il link di recupero è lo stesso dell'italiano"
    - id: AC-4901-2
      given: "i cataloghi it, es-ES ed es-419"
      when: "si esegue il controllo di parità su tutti i namespace"
      then: "nessuna chiave mancante in es-ES, nessun valore vuoto, argomenti ICU uguali a quelli italiani e nessuna occorrenza vietata"

  target_tests:
    - file: "tests/integration/email-es.test.ts"
      covers: [AC-4901-1]
    - file: "tests/unit/i18n-catalog-parity.test.ts"
      covers: [AC-4901-2]

  security_notes:
    - "A03 / CWE-79: i testi delle email restano escapati dai template (T-1402)."
    - "Legale (D-15): i testi spagnoli sono segnaposto e non attivano il lancio commerciale."

  out_of_scope:
    - "Testi legali definitivi in spagnolo (forniti dall'utente o da un consulente, D-15)."

- id: T-4902
  title: "Pagine pubbliche /es e /es-419 e accensione delle lingue spagnole"
  macrotask: "es-public"
  depends_on: [T-4901, T-1801]

  objective: >
    Offrire lo spagnolo ai visitatori e agli utenti, con il sito pubblico indicizzabile nelle due varianti.

  definition_of_done:
    - "lib/marketing/routes.ts: percorso pubblico per lingua (it → /it, en → /en, es-ES → /es, es-419 → /es-419) per ogni pagina pubblica; alternate con tutte le lingue per gli hreflang (it, en, es-ES, es-419 e x-default verso /en) nei metadata e nella sitemap."
    - "OFFERED_LOCALES con es-ES ed es-419: selettore della lingua del sito pubblico, preferenze dell'account (PATCH accetta 'es-ES' ed 'es-419') e riconoscimento dal browser di T-4701 per i visitatori senza cookie."
    - "Passata sulle schermate: E2E che apre home, keyword, piano e impostazioni del progetto con utenti es-ES ed es-419 e controlla che nessun testo visibile sia una chiave del catalogo o un testo inglese di ripiego; le correzioni di lunghezza e di tono vanno nel registro di docs/I18N-ES.md."

  acceptance_criteria:
    - id: AC-4902-1
      given: "un visitatore senza cookie con Accept-Language 'es-MX'"
      when: "apre /"
      then: "viene portato a /es-419 e la pagina ha i link hreflang es-ES verso /es, es-419 verso /es-419, it, en e x-default"
    - id: AC-4902-2
      given: "un utente autenticato"
      when: "invia PATCH delle preferenze con ui_locale 'es-419', poi apre la home"
      then: "la risposta è 200 e la home mostra il pulsante dell'avvio rapido con «Buscar palabras clave»"
    - id: AC-4902-3
      given: "utenti es-ES ed es-419 con un progetto con keyword e piano"
      when: "si aprono home, keyword, piano e impostazioni del progetto"
      then: "in nessuna pagina compare una chiave del catalogo né un testo del catalogo inglese di ripiego"

  target_tests:
    - file: "tests/integration/marketing-routes-es.test.ts"
      covers: [AC-4902-1]
    - file: "tests/e2e/i18n-es.spec.ts"
      covers: [AC-4902-2, AC-4902-3]

  security_notes:
    - "A01 / CWE-601: i redirect di lingua vanno solo verso percorsi interni dell'elenco delle pagine pubbliche."

  out_of_scope:
    - "Domini o sottodomini per paese (per esempio .es o .mx)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-47): ambito «tutto» (app, sito pubblico, email, export, errori), testi legali spagnoli come segnaposto (D-15), passata finale sulle schermate.
- Gate umani: nessuno sulle baseline visive esistenti (le schermate spagnole sono nuove). Una rilettura madrelingua resta facoltativa (scelta dell'utente).
- Scelte dell'agente (approvate con il modulo): percorsi /es per es-ES e /es-419 per l'America Latina; x-default verso /en; testi legali spagnoli condivisi dalle due varianti.
- Note di costruzione (2026-10-19), scelte dell'agente da confermare dall'utente. T-4901: i 7 namespace mancanti (`workspace`, `admin`, `emails`, `marketing`, `pricing`, `legal`, `contact`, 380 chiavi) in es-ES, che ora ha tutti i 29 namespace dell'italiano (1373 chiavi), con 142 differenze in es-419 (pretérito indefinido, vencer, Administrar, Configuración, agregar, verificación, promedio, de inmediato, Comunícate con); le email aprono con «Hola, {name}:» e il testo in maiuscola (norma delle lettere in spagnolo); root admin «administrador principal», Sottoscrittore «Suscriptor», job degli indicatori «trabajo»; titoli legali Política de privacidad, Términos del servicio, Política de cookies. `content/legal/es/` con i tre segnaposto (version `segnaposto-2026-10-07` come i termini attuali), letti da es-ES ed es-419 tramite `LEGAL_FOLDERS` di `lib/legal/documents.ts`; `npm run legal:check` controlla le cartelle delle lingue offerte (it, en, es: 9 file) e le fixture di `tests/fixtures/legal/` hanno anche `es/`; `docs/RELEASE.md` aggiornato. Le email non hanno richiesto codice: leggono già `MESSAGES` a livelli con la lingua del destinatario. T-4902: `OFFERED_LOCALES` con le quattro lingue; in `lib/marketing/routes.ts` il segmento di ogni lingua (`/es` per es-ES, `/es-419`), `siteSegmentLocale` per il segmento `[lang]` (`/es-ES` resta 404 e non è pubblico), `hreflangPaths` con x-default verso la versione inglese della stessa pagina (anche per la landing, prima `/`) e `alternates` di ogni voce al posto dell'unico `alternate`; sitemap con le stesse cinque voci; og:locale `es_ES` ed `es_LA` (og:locale vuole lingua_TERRITORIO, es_LA è il codice dello spagnolo d'America Latina). Sulle pagine pubbliche la lingua della barra è il selettore delle quattro lingue (prima un link all'altra lingua) che porta alla stessa pagina con `router.push`, senza toccare il cookie, come il link di prima. POST /api/locale scriveva la lingua nel database senza conversione: con lo spagnolo offerto Prisma avrebbe rifiutato `es-ES`, ora usa `uiLocaleOf`. `displayPrice` dei piani accetta anche es-ES ed es-419: D-14 dovrà dare i prezzi visualizzati anche nelle due varianti (senza, la pagina prezzi spagnola mostra il piano senza prezzo). L'E2E di AC-4902-3 legge le righe di testo visibile (`innerText`) di home, keyword del progetto e del tema, piano e impostazioni e cerca chiavi del catalogo (righe o parole uguali a una chiave) e testi del catalogo inglese che nessun catalogo spagnolo usa (riga uguale al messaggio, argomenti semplici come testo qualunque); restano fuori i messaggi con plural, select o tag e i testi composti da più messaggi. Passata sulle schermate a 1280 e 390 px con due correzioni di lunghezza (occhiello della landing, indicatore dei job della Panoramica) e le note nel registro di `docs/I18N-ES.md`. Emendamenti dichiarati: AC-1801-3 nel modulo 18 (x-default verso /en, hreflang es-ES ed es-419) e AC-4701-4 superato nel modulo 47; test toccati con `impacted-by: T-4902` o `T-4901`: `sitemap-robots`, `top-nav-support-link`, `i18n-es-locales`, `preferences-es`, `legal-check`, `landing.spec`. Nessuna rilettura madrelingua (facoltativa, D-47).
