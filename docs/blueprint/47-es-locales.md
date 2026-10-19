# 47-es-locales — Macrotask `es-locales`

> Spagnolo (D-47), modulo 1 di 5: le lingue `es-ES` ed `es-419` nella piattaforma, con la guida di stile e il glossario per una localizzazione semantica, e il percorso di lavoro dell'app tradotto. Le due lingue restano nascoste nei selettori finché il modulo 49 non completa i cataloghi.

## Obiettivo del macrotask
Il 2026-10-18 l'utente ha chiesto lo spagnolo di Spagna e d'America Latina in tutta la piattaforma, con una localizzazione professionale «come si dice nel paese» e non una traduzione letterale. Dopo questo modulo:

- **Lingue**: `es-ES` («Español (España)») ed `es-419` («Español (Latinoamérica)»); `es-419` contiene solo le differenze da `es-ES` e i cataloghi si uniscono come inglese ← es-ES ← es-419, così una chiave non ancora tradotta si legge in inglese.
- **Riconoscimento e targeting**: dal browser `es` ed `es-ES` diventano `es-ES`, `es-419` e i paesi ispanofoni d'America Latina diventano `es-419`; il paese predefinito delle ricerche è ES con `es-ES` e, con `es-419`, il paese del browser se è d'America Latina, altrimenti MX.
- **Guida di stile e glossario** in `docs/I18N-ES.md`, approvati con questo modulo (sotto).
- **Percorso di lavoro in spagnolo**: dashboard, progetti, keyword, piano, ricerche, risultati, prossimo passo, navigazione ed errori nelle due varianti.

### Guida di stile (approvata dall'utente il 2026-10-18)
- Si traduce l'intento della frase come la scriverebbe un prodotto nato in quel mercato, non le parole dell'italiano: «Trova le keyword» → «Buscar palabras clave».
- «tú» in entrambe le varianti; mai «vosotros» né voseo; «ustedes» quando ci si rivolge a più persone.
- Pulsanti e voci di menu all'infinito («Guardar», «Exportar»); maiuscola solo sulla prima parola; punteggiatura spagnola («¿…?», «¡…!»); formati di data e numero della lingua.
- Per un termine dubbio vale come lo scrivono Google Ads, Search Console e gli strumenti SEO localizzati in quella variante.

### Glossario
| Italiano | es-ES | es-419 |
|---|---|---|
| keyword | palabra clave | palabra clave |
| parole di partenza | palabras clave semilla | palabras clave semilla |
| ricerche al mese | volumen de búsqueda mensual | volumen de búsqueda mensual |
| pagina principale (hub) | página pilar | página pilar |
| approfondimento (spoke) | artículo satélite | artículo satélite |
| argomento | tema | tema |
| piano dei contenuti | plan de contenidos | plan de contenidos |
| tieni / scarta | conservar / descartar | conservar / descartar |
| caricare un file | subir un archivo | cargar un archivo |
| costi | costes | costos |
| impostazioni | Ajustes | Configuración |
| computer / cellulare | ordenador / móvil | computadora / celular |
| email | correo electrónico | correo electrónico |
| workspace | espacio de trabajo | espacio de trabajo |
| Da scrivere / In scrittura / Pubblicata | Por escribir / En redacción / Publicada | Por escribir / En redacción / Publicada |
| Keyword Planner | Planificador de palabras clave | Planificador de palabras clave |

## Task atomici

```yaml
- id: T-4701
  title: "Lingue es-ES ed es-419 nella piattaforma"
  macrotask: "es-locales"
  depends_on: [T-1301, T-2301, T-3902]

  objective: >
    Preparare la piattaforma alle due varianti dello spagnolo, con cataloghi che si completano a vicenda e la lingua e il
    paese giusti già dal primo accesso.

  definition_of_done:
    - "lib/i18n/locale.ts: SUPPORTED_LOCALES con 'es-ES' ed 'es-419'; OFFERED_LOCALES (lingue nei selettori e accettate da PATCH delle preferenze) resta ['it', 'en'] fino a T-4902. Migrazione additiva 0048_ui_locale_es: valori 'es-ES' ed 'es-419' dell'enum UiLocale (es_ES ed es_419 in Prisma con @map)."
    - "lib/i18n/catalogs.ts e i18n/request.ts: messages/es-ES.json completo nel tempo e messages/es-419.json con le sole differenze; il catalogo di una lingua spagnola è l'unione profonda di en, es-ES e (per es-419) es-419, da una mappa statica (CWE-22)."
    - "Riconoscimento: Accept-Language 'es' o 'es-ES' → es-ES; 'es-419', 'es-US' o 'es-' con un paese ispanofono d'America Latina (AR, BO, CL, CO, CR, CU, DO, EC, GT, HN, MX, NI, PA, PE, PR, PY, SV, UY, VE) → es-419; gli altri 'es-XX' → es-ES. resolveDefaultTargeting: es-ES → es/ES; es-419 → es e il paese della regione dell'Accept-Language se è nell'elenco, altrimenti MX."
    - "Formati di data e numero con la lingua dell'utente (formatter di next-intl): 1.234,5 e date al modo spagnolo."

  acceptance_criteria:
    - id: AC-4701-1
      given: "es-ES.json senza la chiave common.close ed es-419.json con la sola chiave nav.support"
      when: "si costruiscono i cataloghi di es-ES ed es-419"
      then: "common.close vale il testo inglese in entrambe; nav.support vale il testo di es-419 in es-419 e quello di es-ES in es-ES"
    - id: AC-4701-2
      given: "intestazioni Accept-Language 'es', 'es-AR,es;q=0.9', 'es-419', 'es-US' e 'it-IT'"
      when: "si risolve la lingua di un visitatore senza cookie"
      then: "le lingue sono es-ES, es-419, es-419, es-419 e it"
    - id: AC-4701-3
      given: "un utente senza progetti con lingua es-419 e Accept-Language 'es-CO', poi 'es-419'"
      when: "si risolve il targeting predefinito"
      then: "il primo è es/CO, il secondo es/MX; con lingua es-ES è es/ES"
    - id: AC-4701-4
      given: "un utente autenticato"
      when: "invia PATCH delle preferenze con ui_locale 'es-ES' prima di T-4902"
      then: "la risposta è 400 VALIDATION_ERROR e la lingua dell'utente non cambia (superato da T-4902 il 2026-10-19: con lo spagnolo offerto la PATCH con 'es-ES' o 'es-419' risponde 200 e salva la lingua; una lingua non supportata, per esempio 'de', risponde 400 VALIDATION_ERROR e la lingua non cambia)"

  target_tests:
    - file: "tests/unit/i18n-es-locales.test.ts"
      covers: [AC-4701-1, AC-4701-2, AC-4701-3]
    - file: "tests/integration/preferences-es.test.ts"
      covers: [AC-4701-4]

  security_notes:
    - "A01 / CWE-22: cataloghi da una mappa statica indicizzata dalla lingua già validata, mai da un percorso composto con l'input."
    - "A04: una lingua non offerta non si può salvare finché i cataloghi non sono completi (T-4902)."

  out_of_scope:
    - "Altre varianti regionali (per esempio es-MX separata da es-419) e il voseo."

- id: T-4702
  title: "Guida di stile, glossario e percorso di lavoro in spagnolo"
  macrotask: "es-locales"
  depends_on: [T-4701]

  objective: >
    Tradurre in modo semantico, con la guida e il glossario approvati, le parti dell'app che un utente usa ogni giorno.

  definition_of_done:
    - "docs/I18N-ES.md con la guida di stile e il glossario di questo modulo, le fonti di terminologia e il registro delle scelte fatte durante la traduzione (termine, variante, motivo)."
    - "messages/es-ES.json con i namespace common, metadata, nav, projects, jobs, results, project, nextStep, dashboard, keywords, plan, errors ed errorPages; messages/es-419.json con le sole differenze di quei namespace (per esempio subir/cargar, costes/costos, Ajustes/Configuración); esempi dell'avvio rapido scritti per ciascun mercato."
    - "tests/unit/i18n-catalog-parity.test.ts: per i namespace tradotti es-ES ha tutte le chiavi dell'italiano, nessun valore vuoto e gli stessi argomenti ICU (anche plurali e select); ogni chiave di es-419 esiste in es-ES con gli stessi argomenti; nessun valore di es-ES o es-419 contiene «vosotros», «vuestro» o «keyword» fuori dalle parentesi."

  acceptance_criteria:
    - id: AC-4702-1
      given: "i cataloghi es-ES ed es-419"
      when: "si legge dashboard.quickStart.submit e keywords.volumes.step3"
      then: "submit vale «Buscar palabras clave» in entrambe; step3 contiene «súbelo» in es-ES e «cárgalo» in es-419 e cita il «Planificador de palabras clave»"
    - id: AC-4702-2
      given: "i cataloghi it, es-ES ed es-419"
      when: "si esegue il controllo di parità sui namespace tradotti"
      then: "nessuna chiave mancante, nessun valore vuoto, argomenti ICU uguali a quelli italiani e nessuna occorrenza vietata"

  target_tests:
    - file: "tests/unit/i18n-es-strings.test.ts"
      covers: [AC-4702-1]
    - file: "tests/unit/i18n-catalog-parity.test.ts"
      covers: [AC-4702-2]

  security_notes:
    - "A03 / CWE-79: i testi tradotti restano testo dei cataloghi, resi da React."

  out_of_scope:
    - "Namespace di strategia, export, impostazioni, account, workspace, amministrazione, email e sito pubblico (moduli 48 e 49)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-47): due varianti es-ES ed es-419 (scelta dell'utente), localizzazione semantica professionale e non letterale (richiesta dell'utente), traduzione dell'agente con guida, glossario e controlli; rilettura madrelingua facoltativa.
- Emendamento dichiarato alla costruzione: i numeri delle migrazioni dei moduli 40, 45 e 46 salgono di uno (questo modulo prende la 0048, costruito prima del 40). Alla costruzione (2026-10-19) risultava già applicato con il modulo (0049-0052 nei moduli 40, 45 e 46): nessuna modifica.
- Gate umani: nessuno (guida e glossario approvati con il modulo).
- Scelte dell'agente (approvate con il modulo): elenco dei paesi ispanofoni d'America Latina; MX come paese predefinito di es-419; 'es-US' riconosciuto come es-419 (il paese delle ricerche resta MX se il browser non indica un paese d'America Latina); chiavi non tradotte lette in inglese finché i cataloghi non sono completi.
- Note di costruzione (2026-10-19), scelte dell'agente da confermare dall'utente. T-4701: `OFFERED_LOCALES` vale per i selettori, PATCH delle preferenze, POST /api/locale, la lingua presa dal cookie alla registrazione, il cookie e il browser in `resolveLocale` e il sito pubblico (percorsi, testi legali, prezzi, Open Graph); la lingua salvata dell'utente vale per ogni lingua supportata (fino a T-4902 una lingua spagnola arriva solo da una scrittura diretta nel database). `resolveLocale` ha un secondo argomento `offered` (default `OFFERED_LOCALES`): AC-4701-2 si prova con `SUPPORTED_LOCALES`, cioè il riconoscimento che T-4902 accende; con il default un browser spagnolo passa alla lingua successiva dell'header o all'italiano, come prima. PATCH /api/user/preferences accetta il campo `uiLocale` (camelCase come gli altri campi; l'«ui_locale» dell'AC è la colonna) con le sole lingue offerte, altrimenti 400 VALIDATION_ERROR; GET e PATCH restituiscono anche `uiLocale`; la card delle preferenze salva ancora la lingua con POST /api/locale, che imposta anche il cookie. Prisma espone i nomi dell'enum (`es_ES`, `es_419`), quindi `lib/i18n/db-locale.ts` converte da e verso i tag dell'app (`appLocaleOf`, `uiLocaleOf`): `AuthUser.uiLocale` è ora il tag, le email leggono la lingua così e l'export dei dati personali scrive il tag (`es-ES`). I link alle pagine pubbliche di un utente con lingua spagnola portano alla versione inglese (`siteLocale` in `lib/marketing/routes.ts`) finché non esistono /es e /es-419. Paese predefinito in `lib/modules/default-targeting.ts` (puro): il paese viene dalla prima lingua spagnola di Accept-Language con un paese dell'elenco (`es-CO` → CO, `en-US,es-PE;q=0.7` → PE), `es-US` vale es-419 con paese MX; la home e l'avvio rapido passano l'header. Nomi delle lingue `common.locale.es-ES` ed `es-419` (endonimi) aggiunti anche in it ed en. Formati: il formatter di next-intl usa già la lingua della richiesta; secondo CLDR es-ES non separa le migliaia con quattro cifre (`1234,5`, `12.345,5`; il DoD diceva 1.234,5), es-419 scrive `12,345.5`. Il mock di next/headers di `tests/integration/request-query-count.test.ts` ha anche `headers()` (impacted-by T-4701, nessuna asserzione cambiata). T-4702: 540 chiavi in es-ES e 67 differenze in es-419 (Ajustes/Configuración, añadir/agregar, subir/cargar, caducado/vencido, pretérito perfecto/indefinido, esempi e segnaposto dell'avvio rapido); scelte di traduzione nel registro di `docs/I18N-ES.md` (per esempio «búsqueda» per l'estrazione, «panel» per la dashboard, «Tablero» per la bacheca); l'etichetta di Google Ads «Consultar el volumen de búsqueda y las previsiones» viene da guide non ufficiali ed è da riscontrare sull'interfaccia; nessuna rilettura madrelingua (facoltativa, D-47).
- Emendamento dichiarato (2026-10-19, costruzione del macrotask 49, T-4902): lo spagnolo è una lingua offerta, quindi AC-4701-4 è superato e `tests/integration/preferences-es.test.ts` verifica che PATCH delle preferenze con `es-ES` ed `es-419` risponda 200 e salvi `es_ES` ed `es_419`, che `de` risponda 400 VALIDATION_ERROR senza cambiare la lingua e che POST /api/locale salvi `es-419` nell'utente (con `uiLocaleOf`) e nel cookie; il test di AC-4701-2 sul riconoscimento prima di T-4902 ora prova che browser e cookie portano allo spagnolo anche senza il secondo argomento di `resolveLocale`.
