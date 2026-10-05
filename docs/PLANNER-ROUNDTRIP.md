# Round-trip dei volumi con Keyword Planner

Strada principale e gratuita per i volumi di ricerca (D-09): il cliente esporta le keyword di un progetto,
le carica nel proprio Keyword Planner di Google Ads e reimporta il file dei risultati. L'API Google Ads non
si usa per le metriche.

## 1. Export delle keyword (T-904)

- **Dall'interfaccia**: pagina dei risultati del progetto, riquadro «Volumi da Keyword Planner», pulsante
  «Esporta per Keyword Planner». L'export usa la sezione mostrata (o tutto il progetto) e offre un link per
  ogni file.
- **Da CLI (operatore)**:

  ```bash
  npm run planner:export -- --project <id> [--section <id>] [--chunk <n>] [--out <cartella>]
  ```

  `--chunk` è un intero da 1 a 10000 (default 1000, D-26); `--out` vale `./planner-exports/` (ignorata da
  git: contiene keyword dei clienti). Serve `DATABASE_URL` nell'ambiente o in `.env`. Una sezione di un
  altro progetto o un `--chunk` non valido terminano con exit code 1 senza scrivere file.

Ogni file è UTF-8 con la sola colonna `Keyword` (modello di caricamento a una colonna della guida Google
Ads, https://support.google.com/google-ads/answer/7337243), una keyword per canonical: la prima candidata in
ordine alfabetico. Nome: `<projectId>-<sectionId o all>-partNN.csv`. Restano fuori, con il motivo nel
riepilogo, le keyword oltre 80 caratteri o 10 parole (limiti della stessa guida) e quelle che iniziano con
`=`, `+`, `-` o `@` (un foglio di calcolo le leggerebbe come formule).

## 2. Keyword Planner

In Google Ads: Strumenti > Keyword Planner > «Ottieni volume di ricerca e previsioni» > carica un file alla
volta, imposta lingua e paese del progetto, poi scarica le idee di keyword o le metriche storiche.

**Da verificare con un caricamento reale** (azione dell'utente, con il suo account Google Ads): il numero
massimo di keyword per caricamento non è documentato da Google; il default di 1000 è prudente (D-26).
Annotare qui il limite osservato.

## 3. Import dei volumi

Il file scaricato da Keyword Planner si reimporta nella pagina dei risultati o da CLI (T-910, vedi sotto
quando è disponibile).
