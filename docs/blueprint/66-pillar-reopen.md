# 66-pillar-reopen — Macrotask `pillar-reopen`

> «Rigenera» rimette in gioco le keyword di una pagina principale ancora da scrivere anche quando uno dei suoi spoke è iniziato (D-61).

## Obiettivo del macrotask
Oggi «Rigenera» (T-2502, `loadLockedPages` in `lib/modules/strategy/service.ts`) blocca la pagina principale (pilastro) di un hub con almeno uno spoke in scrittura o pubblicato e la copia nel piano nuovo con tutte le sue keyword, anche se la pilastro è ancora da scrivere. In «Noleggio magnetoterapia», con gli spoke «costo» e «farmacia» in scrittura, il piano rigenerato il 2026-11-15 ha ancora 160 keyword su 175 nella pilastro: è il piano fatto quando i risultati di Google erano link `google.com/goto` (T-6504). Sui risultati veri, senza pagine bloccate, la pilastro ne avrebbe 49 (Self-check del modulo 65).

Scelta dell'utente del 2026-11-15 (AskUserQuestion, opzione consigliata «Rimette in gioco», poi «si approvo tutto» sulla descrizione in chat): una pilastro ancora da scrivere tiene solo la sua keyword principale e i titoli cambiati a mano; tutte le altre sue keyword tornano nel perimetro e il motore le ridistribuisce. Gli spoke iniziati, una pilastro già iniziata e il testo del dialogo «Rigenera il piano» restano come sono.

Dopo questo modulo una rigenerazione di «Noleggio magnetoterapia» con «costo» e «farmacia» in scrittura dà una pilastro con circa 48 keyword (prova dell'agente sulla fixture `it-magnetoterapia-real-serp.json` del 2026-11-15: 1 + 47, 12 spoke nuovi, nessuna keyword non assegnata).

## Task atomici

```yaml
- id: T-6601
  title: "La pilastro da scrivere di un hub ancorato tiene solo la keyword principale"
  macrotask: "pillar-reopen"
  depends_on: [T-2502, T-6303]

  objective: >
    Far riorganizzare da «Rigenera» anche le keyword di una pagina principale non ancora iniziata, tenendo il gruppo, gli
    spoke iniziati e i titoli che l'utente ha cambiato.

  definition_of_done:
    - "lib/modules/strategy/service.ts (loadLockedPages): un hub con status TODO, bloccato solo perché ha almeno uno spoke in WRITING o PUBLISHED, si copia con la sola keyword MAIN; le sue keyword SECONDARY non sono più bloccate, quindi tornano nel perimetro se sono ancora tenute e il motore le assegna come le altre (all'hub ancorato, a uno spoke o tra le non assegnate). Un hub in WRITING o PUBLISHED e gli spoke iniziati si copiano con tutte le keyword, come oggi."
    - "La copia della pilastro da scrivere tiene id di origine (gli articoli passano alla copia, T-4002), keyword MAIN, h1, h2 con h1_edited e h2_edited, tipo di contenuto, stato e published_url; priorità e H2 non modificati a mano si ricalcolano con refreshAnchoredHubs, come oggi. Nessuna pagina nuova ha la keyword principale della pilastro."
    - "Le keyword spostate a mano nella pilastro (move_keywords) si ridistribuiscono come le altre, e quelle non più tenute escono dal piano: scelta dell'utente del 2026-11-15, nessun flag nuovo né migrazione."
    - "docs/blueprint/25-ux-plan.md: DoD di T-2502 emendato con il rimando a T-6601 (una pilastro da scrivere copia la sola keyword principale). Il testo del dialogo «Rigenera il piano» non cambia."

  acceptance_criteria:
    - id: AC-6601-1
      given: "un piano dalla fixture italiana di T-1901 con lo spoke S «scarpe running offerte» in WRITING, la sua pilastro P «scarpe running» in TODO con l'H1 riscritto a mano, e la keyword K «scarpe running recensioni» dello spoke T «migliori scarpe running» (in TODO, stesso hub) spostata in P con move_keywords"
      when: "si invia POST strategies con mode AUTO e regenerate true e il lavoro di piano arriva in fondo"
      then: "nel piano nuovo la copia di P ha la stessa keyword principale, lo stesso H1 con h1_edited true e lo stato TODO; K non è nella copia di P ed è nella pagina con la keyword principale di T; S ha H1, keyword e stato di prima sotto la copia di P; nessuna keyword compare in due pagine"
    - id: AC-6601-2
      given: "lo stesso piano con K spostata in P, ma con P in WRITING"
      when: "si rigenera il piano"
      then: "la copia di P ha tutte le keyword di P, K compresa, e lo stato WRITING"

  target_tests:
    - file: "tests/integration/plan-regenerate.test.ts"
      covers: [AC-6601-1, AC-6601-2]

  security_notes:
    - "A01 / CWE-639: nessuna rotta nuova; la rigenerazione resta dietro strategy.write e il lock del workspace, e legge solo il piano del progetto autorizzato."
    - "A04: il motore (buildStrategyPlan, buildSerpPlan) non cambia; cambiano solo le keyword che entrano nel perimetro."

  out_of_scope:
    - "Contare gli spoke iniziati nel massimo di spoke per hub (oggi un hub ancorato può avere più spoke di maxSpokesPerHub)."
    - "Ricordare quali keyword l'utente ha spostato a mano."
    - "Cambiare il testo del dialogo «Rigenera il piano»."

- id: T-6602
  title: "Rigenerazione verificata sui risultati di Google veri di «Noleggio magnetoterapia»"
  macrotask: "pillar-reopen"
  depends_on: [T-6601, T-6502, T-6504]

  objective: >
    Verificare sui dati veri del progetto il caso visto in produzione: il piano fatto sui link goto, con la pilastro piena
    e due spoke in scrittura, rigenerato con i risultati di Google veri.

  definition_of_done:
    - "Test d'integrazione con le 175 keyword tenute e i risultati di Google della fixture tests/fixtures/strategy/it-magnetoterapia-real-serp.json salvati in keyword_serps (freschi, quindi nessuna richiesta a DataForSEO), un piano inserito con la pilastro «noleggio magnetoterapia» in TODO che ha tutte le keyword tranne quelle di due spoke in WRITING con una keyword ciascuno, «noleggio magnetoterapia costo» e «noleggio magnetoterapia farmacia» (come il piano di produzione del 2026-11-14), il modello che non risponde (solo i riconoscimenti fissi) e le continuazioni simulate come in tests/integration/plan-run-serp.test.ts."
    - "Nessuna chiamata reale a DataForSEO né a OpenRouter; nessun dato di account nella fixture (già vero dal modulo 65)."
    - "Self-check del modulo: numeri della prova (keyword nella pilastro, spoke nuovi, non assegnate)."

  acceptance_criteria:
    - id: AC-6602-1
      given: "il piano inserito con la pilastro di 173 keyword in TODO e i due spoke in WRITING, e i risultati di Google veri della fixture"
      when: "si rigenera il piano con mode AUTO e il lavoro di piano arriva in fondo"
      then: "il piano nuovo ha grouping_source SERP; la pilastro con la keyword principale «noleggio magnetoterapia» ha meno della metà delle keyword del piano; il suo hub ha almeno 4 spoke nuovi oltre ai due in WRITING, che hanno le keyword e lo stato di prima; le keyword del piano più le non assegnate sono 175"

  target_tests:
    - file: "tests/integration/plan-regenerate-real-serp.test.ts"
      covers: [AC-6602-1]

  security_notes:
    - "A06 / CWE-770: il test non fa richieste esterne (risultati freschi in keyword_serps, modello simulato)."

  out_of_scope:
    - "Rigenerare il piano in produzione: lo fa l'utente dopo il deploy."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo su richiesta dell'utente del 2026-11-15 («sistemiamo la pagina principale bloccata da Rigenera»), con la scelta presa con AskUserQuestion e la descrizione approvata in chat («si approvo tutto»), D-61.
- Prova dell'agente prima di scrivere il modulo (script usa e getta nello scratchpad, `buildSerpPlan` sulla fixture `it-magnetoterapia-real-serp.json` con i riconoscimenti fissi e le regole predefinite): senza pagine bloccate pilastro 49 e 12 spoke; con la sola keyword principale della pilastro bloccata (ancora aperta) e gli spoke «noleggio magnetoterapia costo» e «noleggio magnetoterapia farmacia» bloccati con una keyword ciascuno, pilastro 1 + 47 e 12 spoke nuovi, nessuna keyword non assegnata. Il motore per risultati di Google gestisce già un'ancora aperta (le pagine sotto soglia senza URL in comune con uno spoke e le keyword senza risultati con parole in comune vanno alla pilastro ancorata), quindi il cambiamento è solo in `loadLockedPages`.
- Scelte dell'agente da confermare: copia della pilastro da scrivere con la sola keyword MAIN (anche se non più tenuta, come oggi le keyword delle pagine bloccate); AC-6601-1 sulla fixture italiana con move_keywords (rosso con il codice di oggi: K resta in P); AC-6602-1 con la soglia di AC-6502-1 (meno della metà) e almeno 4 spoke nuovi.
- Ordine: dopo il 65; T-6602 dopo T-6601.
- Da sapere (fuori dal modulo): l'hub ancorato di «Noleggio magnetoterapia» avrà 14 spoke (2 in scrittura e 12 nuovi), più del massimo di 12, perché il motore non conta gli spoke bloccati.
