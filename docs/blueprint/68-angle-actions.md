# 68-angle-actions — Macrotask `angle-actions`

> Nel piano l'utente vede gli angoli da valutare e per ciascuno sceglie: farne una pagina, spostarlo o tenerlo come H2 (D-62).

## Obiettivo del macrotask
Il modulo 67 segna gli angoli (`strategy_keywords.angle`), ma oggi l'editor del piano sa solo spostare una keyword in una pagina che esiste o toglierla: non c'è modo di far diventare una keyword una pagina propria. Questo modulo aggiunge le due operazioni che mancano e l'interfaccia delle bozze approvate dall'utente il 2026-11-15 («per ora va bene», https://claude.ai/artifact/WpxU1XdAiwoW1nPGz4WDZA): avviso in testa al piano, etichetta sulle schede, riquadro dell'angolo nel pannello con tre azioni e il foglio «Nuova pagina». Richiesta dell'utente: «vorrei sia poterla far diventare una pagina propria sia farla confluire»; il consiglio dell'AI è nel modulo 69.

## Task atomici

```yaml
- id: T-6801
  title: "Operazioni create_page e keep_angle dell'editor del piano"
  macrotask: "angle-actions"
  depends_on: [T-1904, T-2502, T-6702]

  objective: >
    Far nascere una pagina nuova da una o più keyword del piano e chiudere un angolo tenendolo dov'è, con le regole e il
    controllo delle versioni delle altre operazioni.

  definition_of_done:
    - "lib/modules/strategy/editor.ts e lo schema delle operazioni in lib/modules/strategy/service.ts: operazione create_page con keywordIds (da 1 a 50, keyword del piano), hubPageId (id di una pagina HUB del piano, oppure null per una pagina principale nuova), h1 facoltativo (stesso limite di lunghezza della PATCH delle pagine) e contentType facoltativo (guide se manca). La pagina nuova è SPOKE dell'hub indicato o HUB se hubPageId è null, ha la prima keyword come MAIN e le altre come SECONDARY, stato TODO, reason_code MANUAL_PAGE; con h1 ha h1_edited true, senza h1 i titoli li calcola refreshTitles come per le altre pagine. Le keyword lasciano le pagine di prima con le regole di oggi (normalize: pagina vuota eliminata, keyword principale riassegnata)."
    - "Operazione keep_angle con keywordIds: mette angle false senza spostarle. create_page mette angle false alle keyword che usa."
    - "Il salvataggio delle operazioni inserisce la pagina nuova nella strategia nella stessa transazione, con version più 1 e il conflitto di versione di oggi (409); su una versione precedente 409 STRATEGY_READ_ONLY (T-2502)."
    - "MANUAL_PAGE nei motivi delle pagine («Pagina creata da te» e traduzioni) nei cataloghi it, en, es-ES (es-419 solo se diverso), letto da pannello, export e PDF come gli altri motivi."

  acceptance_criteria:
    - id: AC-6801-1
      given: "una strategia con la keyword K angle true nella pilastro P"
      when: "si invia l'operazione create_page con keywordIds [K], hubPageId l'id di P e h1 «Magnetoterapia alla spalla»"
      then: "la risposta è 200; c'è uno SPOKE nuovo sotto P con K come MAIN, h1 «Magnetoterapia alla spalla», h1_edited true, stato TODO e reason_code MANUAL_PAGE; K ha angle false e non è più in P; version è aumentata di 1"
    - id: AC-6801-2
      given: "una strategia con lo spoke S di una sola keyword A e la keyword B nella pilastro P"
      when: "si invia create_page con keywordIds [B, A] e hubPageId null"
      then: "c'è un HUB nuovo con B come MAIN e A come SECONDARY; S non esiste più"
    - id: AC-6801-3
      given: "una strategia con la keyword K angle true"
      when: "si invia keep_angle con keywordIds [K]; poi create_page con hubPageId l'id di uno SPOKE; poi create_page su una versione precedente"
      then: "la prima risposta è 200 e K ha angle false nella stessa pagina; la seconda è 400 senza modifiche; la terza è 409 con codice STRATEGY_READ_ONLY"

  target_tests:
    - file: "tests/integration/strategy-operations.test.ts"
      covers: [AC-6801-1, AC-6801-2, AC-6801-3]

  security_notes:
    - "A01 / CWE-639: le operazioni restano dietro strategy.write e il lock della strategia; keywordIds e hubPageId devono appartenere alla strategia indicata, altrimenti 404 come le altre operazioni."
    - "A03 / CWE-20: h1 validato con zod e lo stesso limite della PATCH; keywordIds al massimo 50."

  out_of_scope:
    - "Interfaccia (T-6802)."
    - "Un'operazione per staccare una keyword in una pagina senza scegliere l'hub: hubPageId null crea una pagina principale."

- id: T-6802
  title: "Angoli nel piano: avviso, etichette, riquadro e foglio «Nuova pagina»"
  macrotask: "angle-actions"
  depends_on: [T-2504, T-2505, T-6801]

  objective: >
    Mostrare gli angoli dove l'utente lavora sul piano e dargli le tre azioni delle bozze approvate.

  definition_of_done:
    - "Avviso in testa al piano (components/plan, vicino a plan-grouping-notice.tsx) quando il piano ha almeno un angolo: «N angoli da valutare», le prime 5 keyword e «Vedi gli angoli», che apre il pannello della prima pagina con un angolo. Nessun avviso senza angoli o su una versione precedente."
    - "Sulle schede della bacheca e nella vista elenco (components/plan/plan-board.tsx) un'etichetta «N angoli» sulle pagine che ne hanno."
    - "Nel pannello della pagina (components/plan/page-panel.tsx) ogni keyword con angle true ha l'etichetta «Angolo da valutare», il volume (o «volume non disponibile») e tre azioni: «Fanne una pagina» (apre il foglio), «Sposta in…» (il dialogo di oggi, move_keywords) e «Tienila come H2» (keep_angle)."
    - "Foglio «Nuova pagina» (dialogo modale con useModalFocus): «Sotto la pagina principale» (le pagine HUB del piano, preselezionata quella della keyword, più «Nessuna: diventa una pagina principale»), «Titolo (H1)» facoltativo (vuoto: lo propone il piano), «Tipo di contenuto», «Porta con te anche» con gli altri angoli della stessa pagina, «Crea la pagina» (create_page) e «Annulla». Dopo la creazione il pannello si apre sulla pagina nuova."
    - "Testi nei cataloghi it, en, es-ES (es-419 solo se diverso); a 390 px di larghezza riquadro e foglio stanno nella finestra senza scorrimento orizzontale e i pulsanti sono alti almeno 44 px."

  acceptance_criteria:
    - id: AC-6802-1
      given: "un piano con due keyword angle true nella pilastro e nessuna altrove"
      when: "si apre il piano"
      then: "l'avviso dice «2 angoli da valutare» con le due keyword; la scheda della pilastro ha l'etichetta «2 angoli»; le altre schede non hanno l'etichetta"
    - id: AC-6802-2
      given: "il pannello della pilastro con l'angolo K"
      when: "si preme «Tienila come H2»"
      then: "parte l'operazione keep_angle con keywordIds [K] e la version del piano; dopo la risposta K non ha più l'etichetta «Angolo da valutare»"
    - id: AC-6802-3
      given: "il pannello della pilastro P con l'angolo K"
      when: "si preme «Fanne una pagina», si scrive l'H1 «Magnetoterapia alla spalla» e si preme «Crea la pagina»"
      then: "parte create_page con keywordIds [K], hubPageId l'id di P e h1 «Magnetoterapia alla spalla»; il foglio si chiude e il pannello mostra la pagina nuova"

  target_tests:
    - file: "tests/component/plan-angles.test.tsx"
      covers: [AC-6802-1, AC-6802-2, AC-6802-3]

  security_notes:
    - "A03 / CWE-79: keyword e H1 resi come testo da React, mai come HTML."
    - "Nessuna rotta nuova: il client usa le operazioni di T-6801."

  out_of_scope:
    - "Consiglio dell'AI e H1 proposto (modulo 69)."
    - "Consigli sulle città (modulo 70)."
    - "Baseline visive nuove: le schermate cambiano solo con angoli presenti, che le baseline di oggi non hanno."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla conversazione del 2026-11-15 (D-62): richiesta dell'utente «vorrei sia poterla far diventare una pagina propria sia farla confluire», bozze approvate («per ora va bene»: schermate 1, 2 e 3 della canvas).
- Scelte dell'agente da confermare: reason_code MANUAL_PAGE (stringa, nessuna migrazione); create_page con hubPageId null crea una pagina principale; massimo 50 keyword per operazione; «Porta con te anche» limitato agli altri angoli della stessa pagina (le bozze mostravano anche una pagina esistente, che arriva con il consiglio dell'AI del modulo 69); «Vedi gli angoli» apre la prima pagina con un angolo invece di un filtro nuovo.
- Ordine: dopo il 67; T-6802 dopo T-6801.
- Note di costruzione (2026-11-15, scelte dell'agente da confermare dall'utente). T-6801: `create_page` e `keep_angle` in `lib/modules/strategy/editor.ts`; l'id della pagina nuova lo sceglie `operateOnStrategy` (randomUUID) perché l'editor resti puro, e la risposta della rotta delle operazioni ha anche `pageId` per create_page. La pagina nuova va in fondo agli spoke dell'hub indicato, o in fondo al piano se è principale; la prima keyword è la principale e l'ordine degli id conta (`keywordsByIds`, usato anche da move_keywords, toglie i doppioni). Un hubPageId che non è una pagina principale è 400; se l'hub indicato perde tutte le keyword nella stessa operazione, normalize lo elimina e la pagina nuova diventa principale come gli altri spoke di un hub eliminato. `keep_angle` accetta fino a 5000 keyword come move_keywords: il limite di 50 vale solo per create_page; `contentType` guide quando manca. `persistState` crea le pagine nuove prima di spostare le keyword. MANUAL_PAGE senza parametri. AC-6801-1…3 rossi con il codice di prima (verificato), più un caso per una keyword di un'altra strategia (404) e 51 keyword (400). T-6802: avviso dentro `PlanBoard`, sopra l'avanzamento, invece che nell'intro della pagina accanto a `PlanGroupingNotice`, perché «Vedi gli angoli» apre il pannello con lo stato del client; componenti in `components/plan/plan-angles.tsx` (`PlanAnglesNotice`, `AngleCount`, `AngleBox`, `NewPageDialog`); le keyword dell'avviso seguono l'ordine di lavoro delle pagine. Nel pannello i riquadri degli angoli stanno sotto l'elenco delle keyword e hanno le sole tre azioni delle bozze (niente «Togli»); tutti i loro pulsanti sono secondari, perché ogni schermata ha un solo pulsante primario (AC-2605-1); «Tienila come H2» toglie il riquadro appena la risposta arriva, prima del ricaricamento. Dopo «Crea la pagina» il foglio si chiude e il pannello resta sulla pagina di prima finché il piano ricaricato non contiene la nuova. Nelle versioni precedenti nessun avviso, etichette sì, angoli nell'elenco delle keyword senza azioni. `PagePanel` ha `hubs` e `onOpenPage` facoltativi, così i test di componente che montano il solo pannello restano com'erano. es-ES «ángulo por evaluar» per le due varianti (es-419 senza differenze). E2E non target `tests/e2e/plan-angles.spec.ts` per il DoD a 390 px (riquadro e foglio nella finestra senza scorrimento orizzontale, pulsanti alti almeno 44 px, axe senza violazioni gravi) e per la pagina nuova nel pannello. AC-6802-1…3 rossi senza le modifiche di `plan-board.tsx` e `page-panel.tsx` (verificato).
