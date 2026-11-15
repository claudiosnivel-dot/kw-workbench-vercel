# 67-plan-angles — Macrotask `plan-angles`

> La pagina locale riceve solo luoghi e ogni pagina che il motore scioglie diventa un «angolo da valutare», non keyword sparite in silenzio dentro un'altra pagina (D-62).

## Obiettivo del macrotask
Nel piano rigenerato in produzione il 2026-11-15 per «Noleggio magnetoterapia» (dopo il modulo 66) la pagina locale «vicino a me» ha 125 keyword su 175: le città riconosciute dall'AI più keyword che non sono luoghi, come «spalla», «iva», «recensioni», «i tech» e «magnetoterapia notturna noleggio». Sono pagine sotto soglia che confluiscono nello spoke con più URL in comune (T-6502), e la pagina locale, con un centinaio di città, somma centinaia di URL distinti contro le 20-60 delle altre pagine: vince per dimensione.

Scelte dell'utente del 2026-11-15 (D-62): le città non si automatizzano (decide l'utente, con i consigli del modulo 70); il volume non è una garanzia e le keyword dell'autocomplete hanno domanda anche senza volume («ho posizionato un mio sito basandomi solo sull'autocomplete»); una pagina che il motore scioglie diventa un «angolo da valutare» che l'utente promuove a mano (seconda opzione, «la seconda»), non una pagina automatica; vale per ogni pagina sciolta, con volume noto, basso o non disponibile, e oltre il massimo di spoke, tranne luoghi e concorrenti; senza i luoghi riconosciuti dall'AI non ci sono angoli («si mi tornano», sulle due scelte consigliate).

Questo modulo cambia motore e dati: le azioni e l'interfaccia sono nel 68, i consigli dell'AI nel 69, i consigli sulle città nel 70.

## Task atomici

```yaml
- id: T-6701
  title: "La pagina locale riceve solo luoghi"
  macrotask: "plan-angles"
  depends_on: [T-6302, T-6303, T-6502]

  objective: >
    Togliere dalla pagina locale le keyword che non sono luoghi: una pagina sciolta o una domanda messa nelle FAQ non
    confluisce mai nella pagina locale, che resta fatta solo dalle keyword place.

  definition_of_done:
    - "lib/modules/strategy/serp-cluster.ts (settleHub, passo 5): le pagine sciolte per soglia o per il massimo di spoke e le domande messe nelle FAQ scelgono il bersaglio fra gli spoke tenuti senza la pagina local; senza uno spoke con almeno 1 URL in comune vanno nella pilastro come oggi (o nell'ancora, T-2502). La pagina local ha solo le keyword place (passo 4)."
    - "Commento del passo 5 in serp-cluster.ts aggiornato con il rimando a T-6701; buildStrategyPlan (motore senza risultati di Google) non cambia."

  acceptance_criteria:
    - id: AC-6701-1
      given: "un perimetro con tre keyword place con 10 URL ciascuna, uno spoke tenuto S con 2 keyword e una keyword K con volume null che forma una pagina sotto soglia con 3 URL in comune con le place e 1 URL in comune con S"
      when: "si chiama buildSerpPlan"
      then: "K è una keyword secondaria di S; la pagina con contentType local ha come keyword le sole tre place"
    - id: AC-6701-2
      given: "lo stesso perimetro con K senza URL in comune con S"
      when: "si chiama buildSerpPlan"
      then: "K è una keyword della pilastro; la pagina con contentType local ha come keyword le sole tre place"

  target_tests:
    - file: "tests/unit/strategy-serp-cluster.test.ts"
      covers: [AC-6701-1, AC-6701-2]

  security_notes:
    - "A04: cambia solo la scelta del bersaglio; nessun dato nuovo letto o scritto."

  out_of_scope:
    - "Dividere le città in più pagine locali: le sceglie l'utente (D-62, modulo 70)."
    - "Il motore senza risultati di Google (buildStrategyPlan)."

- id: T-6702
  title: "Angoli da valutare: le pagine che il motore scioglie"
  macrotask: "plan-angles"
  depends_on: [T-6701, T-1903, T-2502, T-6303]

  objective: >
    Segnare come «angolo da valutare» la keyword principale di ogni pagina che il motore scioglie, così l'utente la vede
    e decide se farne una pagina, spostarla o tenerla come H2.

  definition_of_done:
    - "lib/modules/strategy/serp-cluster.ts: ogni pagina sciolta al passo 5, per soglia (minKeywordsPerSpoke e minSpokeVolume, con volume noto, basso o null) o oltre maxSpokesPerHub, confluisce come oggi (T-6701) e dà la sua keyword principale a StrategyPlan.angles (campo nuovo e facoltativo in lib/modules/strategy/types.ts, forme canoniche in ordine di priorità), anche quando confluisce nella pilastro di un hub ancorato. Le altre keyword della pagina sciolta la seguono senza essere angoli. Le domande messe nelle FAQ, le keyword place (pagina locale) e le competitor (non assegnate) non sono angoli."
    - "lib/modules/plan-runs/phases.ts (prepareDraft): gli angoli del piano si salvano solo se la classificazione dei luoghi e dei concorrenti è riuscita con l'AI (cursore classify con notice null); con AI_CLASSIFY_UNAVAILABLE o AI_NOT_CONFIGURED il piano si salva senza angoli, perché senza i luoghi riconosciuti le città diventerebbero angoli (D-62). Con il motore senza risultati di Google nessun angolo."
    - "Migrazione additiva 0057_strategy_keyword_angle: colonna strategy_keywords.angle boolean not null default false; schema Prisma aggiornato."
    - "lib/modules/strategy/service.ts (draftStrategy): le keyword di plan.angles si salvano con angle true; le keyword copiate dalle pagine bloccate (T-2502) hanno angle false."
    - "GET della strategia (T-1903) e StrategyKeywordView espongono angle; export, PDF e articoli non cambiano."
    - "lib/modules/strategy/editor.ts: move_keywords mette angle false alle keyword spostate; le altre operazioni di oggi non lo cambiano (le azioni nuove sono nel modulo 68)."

  acceptance_criteria:
    - id: AC-6702-1
      given: "un perimetro con risultati di Google e regole con maxSpokesPerHub 2: tre spoke che superano le soglie con priorità diverse, una pagina A di una keyword con volume 10, una pagina B di una keyword con volume null e una domanda Q sotto questionSpokeVolume con questionsAs faq"
      when: "si chiama buildSerpPlan"
      then: "plan.angles contiene le keyword principali di A, di B e dello spoke a priorità più bassa e non contiene Q né le keyword secondarie delle pagine sciolte; ogni keyword di plan.angles è nel piano come keyword secondaria"
    - id: AC-6702-2
      given: "lo stesso perimetro con tre keyword place e una keyword competitor"
      when: "si chiama buildSerpPlan"
      then: "nessuna keyword place né competitor è in plan.angles"
    - id: AC-6702-3
      given: "un progetto con le keyword e i risultati di Google della fixture it-magnetoterapia-serp.json più una keyword con volume null che forma una pagina sotto soglia, e OpenRouter simulato che risponde con le classi della fixture"
      when: "si avvia il lavoro di piano e arriva in fondo"
      then: "la riga strategy_keywords di quella keyword ha angle true; GET della strategia restituisce angle true per lei e angle false per le keyword principali delle pagine"
    - id: AC-6702-4
      given: "lo stesso progetto con OpenRouter che risponde 503 a ogni modello"
      when: "si avvia il lavoro di piano e arriva in fondo"
      then: "la strategia ha grouping_notice AI_CLASSIFY_UNAVAILABLE e nessuna riga strategy_keywords con angle true"
    - id: AC-6702-5
      given: "una strategia con una keyword angle true in una pagina"
      when: "si invia l'operazione move_keywords che la sposta in un'altra pagina"
      then: "la risposta è 200 e la keyword ha angle false nella pagina di destinazione"

  target_tests:
    - file: "tests/unit/strategy-serp-cluster.test.ts"
      covers: [AC-6702-1, AC-6702-2]
    - file: "tests/integration/plan-run-serp.test.ts"
      covers: [AC-6702-3, AC-6702-4]
    - file: "tests/integration/strategy-operations.test.ts"
      covers: [AC-6702-5]

  security_notes:
    - "A01 / CWE-639: nessuna rotta nuova; la colonna si legge e si scrive solo dalle rotte della strategia, dietro strategy.read e strategy.write."
    - "Migrazione additiva con default: nessun dato esistente cambia; la RLS di strategy_keywords resta com'è."

  out_of_scope:
    - "Azioni «Fanne una pagina» e «Tienila come H2» e interfaccia (modulo 68)."
    - "Consiglio dell'AI (modulo 69)."
    - "Ricordare gli angoli fra una rigenerazione e l'altra: «Rigenera» li ricalcola."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla conversazione del 2026-11-15 dopo la prova in produzione del modulo 66: l'utente ragiona da SEO (città scartate o scelte da chi conosce l'attività, volume non garanzia, autocomplete come segnale di domanda), sceglie la seconda opzione («angolo da valutare» promosso a mano), approva le bozze («per ora va bene», https://claude.ai/artifact/WpxU1XdAiwoW1nPGz4WDZA) e le due scelte consigliate dopo la prova sui dati veri («si mi tornano»), D-62.
- Prova dell'agente (script nello scratchpad sulla fixture `it-magnetoterapia-real-serp.json`, copia di serp-cluster.ts con il registro delle pagine sciolte): con i soli riconoscimenti fissi 126 pagine sciolte (115 per soglia, 11 oltre il massimo), 88 senza volume e quasi tutte città; con 92 keyword marcate come luoghi da un elenco di città scritto a mano, 50 pagine sciolte per soglia, fra cui apparecchi (biostim, i one, i tech, magnum 2500, globus), condizioni (spalla, edema osseo), fisco (iva, detraibile), recensioni e farmacia, più città piccole mancanti dall'elenco. La pagina locale ricostruita somma 663 URL distinti contro 18-63 delle altre pagine: «spalla» ha 5 URL in comune con la locale e 0 con «ginocchio».
- Scelte dell'agente (confermate dall'utente il 2026-11-15, D-63): angolo la sola keyword principale della pagina sciolta (le altre la seguono); FAQ escluse dagli angoli e dalla pagina locale; angoli solo con il motore per risultati di Google e solo con la classificazione dell'AI riuscita (il cursore tiene il primo notice dei lotti, quindi basta un lotto non riuscito per avere un piano senza angoli); nessun ricordo degli angoli fra una rigenerazione e l'altra; migrazione `0057`.
- Ordine: dopo il 66; T-6702 dopo T-6701.
- Note di costruzione (2026-11-15, scelte dell'agente confermate dall'utente lo stesso giorno con AskUserQuestion, D-63). T-6701: in `settleHub` i bersagli delle pagine sciolte e delle domande nelle FAQ sono gli spoke tenuti senza la pagina local; una pagina locale sciolta (sotto soglia o oltre il massimo di spoke) confluisce come prima nello spoke con più URL in comune, ora mai locale, o nella pilastro. Le keyword senza risultati (passo 6) possono ancora andare nella pagina locale per parole di contenuto in comune, come prima: sono quasi sempre luoghi che non hanno avuto la classificazione, perché all'AI vanno solo le keyword con risultati. AC-6701-1 e AC-6701-2 rossi con il codice di prima (verificato: K nella pagina locale). T-6702: la keyword principale di ogni pagina sciolta tranne la locale va in `StrategyPlan.angles`, in ordine di priorità; una pagina sciolta di un hub ancorato chiuso resta fra le non assegnate come oggi e non dà angoli (ogni angolo è una keyword secondaria del piano). `prepareDraft` toglie gli angoli quando il cursore classify non ha notice null, anche senza cursore (lavoro ripreso dopo la fase classify, con i soli riconoscimenti fissi). `draftStrategy` scrive `angle` per le keyword del motore, le copie delle pagine bloccate restano al default false; `StrategyKeywordView.angle` è obbligatorio (fixture dei test di componente aggiornate); `moveKeywords` mette angle false alle keyword spostate davvero e `persistState` scrive i soli passaggi da true a false. I test d'integrazione hanno la risposta di DataForSEO senza volumi in `tests/helpers/plan-run.ts` (`noVolumesResponse`, usata anche da `plan-regenerate-real-serp.test.ts`): la keyword senza volume di AC-6702-3 e AC-6702-4 fa chiedere i volumi, e senza risposta il piano avrebbe PROVIDER_ERROR. AC-6702-1…5 rossi con il codice di prima (verificato). Prova sulla fixture dei risultati veri con i soli riconoscimenti fissi: pagina locale da 23 a 4 keyword, pilastro da 49 a 54, 12 spoke, 126 angoli che il lavoro di piano non salva perché senza l'AI le città non sono riconosciute.
