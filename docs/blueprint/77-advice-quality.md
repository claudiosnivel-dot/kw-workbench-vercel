# 77-advice-quality — Macrotask `advice-quality`

> I consigli dell'AI sugli angoli danno lo stesso consiglio agli angoli che sono la stessa ricerca e propongono H1 non
> tutti con la stessa formula (D-65).

## Obiettivo del macrotask
Prova in produzione del 2026-11-16 («Rigenera il piano» di «Noleggio magnetoterapia», modulo 69): due angoli sul
tappetino, la stessa ricerca scritta in modo diverso, con consigli opposti, e gli H1 proposti tutti «…: guida pratica».
Scelta dell'utente del 2026-11-17 con AskUserQuestion: un modulo di correzione («istruzioni migliori: H1 più vari e
consigli coerenti fra angoli simili»), da costruire dopo i moduli 71-76 di Claude Code. I consigli restano dell'AI di
Titan SEO, per chi usa l'app senza Claude Code (i piani di Claude Code non li hanno, D-64).

## Task atomici

```yaml
- id: T-7701
  title: "Un solo consiglio per gli angoli che sono la stessa ricerca"
  macrotask: "advice-quality"
  depends_on: [T-6901]

  objective: >
    Dare lo stesso consiglio agli angoli con le stesse parole (in ordine diverso, al plurale, con o senza preposizioni),
    chiedendolo all'AI una volta sola.

  definition_of_done:
    - "Nella fase advise gli angoli del piano si raggruppano per insieme di radici (keywordWords di lib/modules/strategy/cluster.ts, parole vuote tolte): ogni gruppo manda all'AI solo l'angolo più cercato (a parità la forma canonica più corta), e il consiglio ricevuto vale per tutti gli angoli del gruppo, ciascuno salvato con lo stesso action, target, reason, alternative e h1."
    - "I lotti da 40 contano i rappresentanti dei gruppi; l'ordine fisso degli angoli e il cursore advise.offset restano, così un gruppo non si divide fra due lotti."
    - "Nelle istruzioni del consiglio una riga in più: angoli con le stesse parole in ordine diverso sono la stessa ricerca e vanno trattati allo stesso modo."

  acceptance_criteria:
    - id: AC-7701-1
      given: "un piano con gli angoli «tappetino magnetoterapia noleggio» (volume 90) e «noleggio tappetini per magnetoterapia» (volume 20) e OpenRouter simulato"
      when: "il lavoro di piano arriva in fondo alla fase advise"
      then: "la richiesta a OpenRouter contiene solo «tappetino magnetoterapia noleggio» fra i due e i due angoli hanno in angle_advice lo stesso action, target e reason"
    - id: AC-7701-2
      given: "45 angoli di cui 10 coppie con le stesse radici"
      when: "il lavoro di piano chiede i consigli"
      then: "le richieste a OpenRouter contengono 35 angoli in un solo lotto e tutti i 45 angoli hanno un consiglio"

  target_tests:
    - file: "tests/integration/plan-angle-advice.test.ts"
      covers: [AC-7701-1, AC-7701-2]

  security_notes:
    - "LLM01 / CWE-1427: gli angoli restano dati JSON nel messaggio, non istruzioni; il raggruppamento non cambia cosa si manda."

  out_of_scope:
    - "Raggruppare angoli che hanno solo alcune parole in comune o lo stesso senso con parole diverse."
    - "Cambiare i consigli già salvati: valgono per i piani rigenerati dopo il modulo."

- id: T-7702
  title: "H1 proposti con formule diverse"
  macrotask: "advice-quality"
  depends_on: [T-7701]

  objective: >
    Evitare che gli H1 proposti dall'AI per le pagine nuove usino tutti la stessa chiusura.

  definition_of_done:
    - "Istruzioni del consiglio (it, es, en): l'H1 di page è specifico per l'angolo, parte dalla keyword o dal suo senso e usa formule diverse fra le pagine, con la stessa chiusura dopo i due punti in al massimo due H1 della risposta; l'esempio della risposta ha due H1 con formule diverse."
    - "Controllo dopo la risposta (parseAngleAdvice): la chiusura è il testo dopo l'ultimo «:» normalizzato (minuscole, senza accenti e spazi doppi); dal terzo H1 con la stessa chiusura in un lotto in poi l'h1 diventa null (il foglio «Nuova pagina» parte allora vuoto e il piano propone il suo H1, come senza consiglio); action, reason e alternative restano."

  acceptance_criteria:
    - id: AC-7702-1
      given: "una risposta simulata con quattro consigli page i cui H1 finiscono tutti con «: guida pratica» e uno con «: costi e modelli»"
      when: "parseAngleAdvice la legge"
      then: "i primi due H1 con «guida pratica» restano, gli altri due sono null con action page e il loro reason, e l'H1 con «costi e modelli» resta"
    - id: AC-7702-2
      given: "un piano in italiano con angoli"
      when: "si costruisce la richiesta del consiglio"
      then: "le istruzioni contengono la regola sulle formule diverse degli H1 e l'esempio ha due H1 con chiusure diverse"

  target_tests:
    - file: "tests/unit/plan-angle-advice.test.ts"
      covers: [AC-7702-1, AC-7702-2]

  security_notes:
    - "Nessun dato nuovo verso il modello: cambiano solo istruzioni e controllo della risposta."

  out_of_scope:
    - "Riscrivere da sé gli H1 scartati: li propone il piano come oggi."
    - "Gli H1 dei titoli con l'AI del pannello (modulo 35)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla scelta dell'utente del 2026-11-17 (D-65): correzione dei consigli dopo la prova in produzione del modulo 69, da costruire dopo i moduli 71-76 («Dopo, come 77»).
- Scelte dell'agente da confermare: gruppi per insieme di radici con un solo angolo mandato all'AI, consiglio copiato uguale agli altri angoli del gruppo, al massimo due H1 con la stessa chiusura per lotto, gli H1 in più a null invece di chiederne altri.
- Ordine: dopo il 76; T-7702 dopo T-7701.
- Note di costruzione (2026-11-22, scelte dell'agente da confermare). T-7701: gruppi con `groupAngles` in `lib/modules/plan-ai/angle-advice.ts` per `variantKey` di `cluster.ts` (le radici di `keywordWords` in ordine alfabetico; un angolo di sole parole vuote fa gruppo da sé), nell'ordine fisso del primo angolo del gruppo; rappresentante scelto con `compareKeywordPriority` senza punteggio (volume più alto, nessun volume dopo lo zero, poi la forma canonica più corta, poi l'ordine alfabetico); il consiglio si copia identico a tutti i membri, target compreso, anche se un membro sta in un'altra pagina; `adviceInputs` legge anche il volume, i gruppi si ricalcolano a ogni passo dalla stessa lista e `advise.offset` conta i gruppi; la lingua del piano (`resolveStrategyTarget`) si legge prima di formare i gruppi, sempre dopo il controllo dell'AI spenta. Riga nuova delle istruzioni nelle tre lingue con «la stessa action e lo stesso target». T-7702: chiusura = testo dopo l'ultimo «:» in forma canonica (`canonicalizeKeyword`: minuscole, senza accenti, spazi semplici); un H1 senza «:» o con «:» in fondo non ha chiusura e resta; si contano solo le voci valide, nell'ordine della risposta, con `MAX_H1_SAME_CLOSING = 2`; l'esempio della risposta ha tre voci (due page con H1 segnaposto e chiusure diverse, un keep).
