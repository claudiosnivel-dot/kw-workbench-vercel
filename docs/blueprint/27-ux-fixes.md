# 27-ux-fixes — Macrotask `ux-fixes`

> Correzioni decise dall'utente il 2026-10-14 (D-40), chiudendo le scelte rimaste aperte dei moduli 23, 25 e 26: la descrizione di un argomento torna modificabile e il vecchio pulsante «Avvia estrazione», non più montato da nessuna pagina, va via.

## Obiettivo del macrotask
Con il modulo 26 la pagina delle impostazioni della sezione è sparita e con lei l'unico campo per scrivere la descrizione di un argomento; la descrizione resta nel database ma non si modifica più. Lo stesso modulo ha lasciato senza pagine RunExtractionButton, il pulsante di avvio dell'estrazione delle vecchie pagine delle sezioni: la ricerca si avvia dalla barra del prossimo passo, dalle parole di partenza e da «Aggiungi i volumi». Dopo questo modulo:

- **Nome e descrizione**: dal menu ⋯ di un argomento la voce «Nome e descrizione» apre un dialogo con i due campi.
- **Niente codice morto**: RunExtractionButton e il suo test non esistono più; i criteri che lo usavano si provano sul pulsante del prossimo passo e su JobProgress, che resta perché la barra del prossimo passo lo usa durante una ricerca.

## Task atomici

```yaml
- id: T-2701
  title: "Nome e descrizione dell'argomento dal menu ⋯"
  macrotask: "ux-fixes"
  depends_on: [T-2403, T-809, T-2602]

  objective: >
    Rendere di nuovo modificabile la descrizione di un argomento, nello stesso dialogo del nome, senza cambiare il
    dialogo Rinomina del progetto.

  definition_of_done:
    - "components/rename-dialog.tsx: con la prop facoltativa description (valore iniziale) il dialogo mostra anche il campo Descrizione, facoltativo e lungo al massimo 1.000 caratteri (D-24), e la PATCH invia { name, description } con description null se vuota dopo il trim; senza la prop il dialogo resta quello di oggi (Rinomina del progetto, T-2305)."
    - "Menu ⋯ dell'argomento (T-2403): la voce «Rinomina» diventa «Nome e descrizione» e apre il dialogo con il nome e la descrizione salvati; la pagina dell'argomento legge description dalla sezione."

  acceptance_criteria:
    - id: AC-2701-1
      given: "il dialogo dell'argomento 'Running' con descrizione 'Scarpe da corsa' e la risposta simulata 200 della PATCH"
      when: "l'utente cancella la descrizione e salva"
      then: "il corpo della PATCH è { name: 'Running', description: null } e il dialogo si chiude"
    - id: AC-2701-2
      given: "le azioni di un argomento con descrizione 'Scarpe da corsa' per un utente con section.write"
      when: "si apre il menu ⋯ e si sceglie «Nome e descrizione»"
      then: "il menu non ha la voce «Rinomina» e il dialogo mostra il campo Descrizione con il valore 'Scarpe da corsa'"

  target_tests:
    - file: "tests/component/topic-name-dialog.test.tsx"
      covers: [AC-2701-1, AC-2701-2]

  security_notes:
    - "A03 / CWE-79: la descrizione è resa come testo. La PATCH esistente della sezione verifica progetto, sezione e ruolo nel workspace (T-809, T-1502) e rifiuta una descrizione oltre 1.000 caratteri (D-24)."

  out_of_scope:
    - "Mostrare la descrizione nella pagina dell'argomento o nella barra laterale."
    - "Descrizione del progetto."

- id: T-2702
  title: "Rimozione di RunExtractionButton"
  macrotask: "ux-fixes"
  depends_on: [T-2603, T-305, T-1205, T-2302]

  objective: >
    Togliere il pulsante di avvio dell'estrazione rimasto senza pagine e spostare i criteri che lo usavano sui
    componenti che oggi avviano e seguono la ricerca.

  definition_of_done:
    - "Rimossi components/run-extraction-button.tsx e tests/component/run-extraction-button.test.tsx; il file esce da I18N_MIGRATED_FILES di tests/unit/no-hardcoded-strings.test.ts; le chiavi dei cataloghi usate solo dal pulsante (jobs.run.start, jobs.run.running, jobs.run.endpointMissing) sono rimosse in it ed en; knip senza segnalazioni."
    - "Emendamenti dichiarati: AC-305-3 e AC-305-4 (modulo 03) si provano sul pulsante del prossimo passo run_topic (NextStepAction, T-2302); AC-1205-3 (modulo 12) su JobProgress montato con il jobId, che resta per la barra del prossimo passo."

  acceptance_criteria:
    - id: AC-2702-1
      given: "il repository dopo la rimozione"
      when: "il test cerca RunExtractionButton e run-extraction-button in app, components e lib"
      then: "le occorrenze sono 0 e il file components/run-extraction-button.tsx non esiste"
    - id: AC-2702-2
      given: "NextStepAction con il passo run_topic e la rotta run simulata, prima con 500 e code JOB_FAILED, poi con 200 e data.status failed"
      when: "si clicca il pulsante del prossimo passo in ciascuno dei due casi"
      then: "il testo «Estrazione non riuscita» è visibile in un elemento role alert e router.push e router.refresh non sono chiamati"

  target_tests:
    - file: "tests/tooling/run-extraction-removed.test.ts"
      covers: [AC-2702-1]
    - file: "tests/component/next-step-run.test.tsx"
      covers: [AC-2702-2]

  security_notes:
    - "Nessuna superficie nuova: si toglie un componente client; le rotte run restano protette lato server (T-1204, T-1502)."

  out_of_scope:
    - "JobProgress: resta, perché la barra del prossimo passo lo usa durante una ricerca (T-2302)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dalle risposte dell'utente del 2026-10-14 (D-40): descrizione nel dialogo «Nome e descrizione» (scelta «Nel dialogo Rinomina») e rimozione del codice morto. Correzione di un'informazione data dall'agente: le note dei moduli 12 e 26 dicevano che anche JobProgress non era più montato, ma la barra del prossimo passo lo usa durante una ricerca; la rimozione approvata riguarda quindi il solo RunExtractionButton.
- Gate umani: nessuno previsto; il modulo non tocca pagine fotografate dalle baseline visive.
- Scelte dell'agente da confermare (rilievi): nome della voce «Nome e descrizione»; descrizione facoltativa come campo di testo su più righe; criteri di AC-305-3 e AC-305-4 spostati sul pulsante del prossimo passo.
- Emendamenti dichiarati alla costruzione (2026-10-14): AC-305-3 e AC-305-4 del modulo 03 si provano sul pulsante del prossimo passo run_topic in `tests/component/next-step-run.test.tsx`, e vietano anche router.push; AC-1205-3 del modulo 12 si prova su JobProgress montato con il jobId e resultsHref; note nei moduli 13 (I18N_MIGRATED_FILES e chiavi di jobs.run) e 24 (la voce Rinomina dell'argomento diventa «Nome e descrizione»).
- Note di costruzione, senza decisioni aperte: le chiavi keywords.menuRename e keywords.rename lasciano il posto a keywords.menuDetails e keywords.details (titolo «Nome e descrizione», campi «Nome dell'argomento» e «Descrizione»); la descrizione è un campo di testo su più righe con maxLength 1000; il dialogo Rinomina del progetto invia ancora solo { name }.
- Scelte dell'agente confermate dall'utente il 2026-10-18 (D-48): voce «Nome e descrizione», descrizione su più righe facoltativa, AC-305-3 e AC-305-4 sul pulsante del prossimo passo.
