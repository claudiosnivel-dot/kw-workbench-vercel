# 59-landing-motion — Macrotask `landing-motion`

> Pagina principale con il percorso guidato (D-53), 3 di 3: il movimento delle pagine di lancio. Su schermi grandi una sola finestra dell'app resta ferma e cambia scena mentre le tappe scorrono; la parallasse e le comparse accompagnano lo scorrimento. Chi non vede il movimento ha la pagina completa del modulo 58.

## Obiettivo del macrotask
Dopo il modulo 58 ogni tappa ha la sua scena accanto al testo, ferma. Dopo questo modulo:

- **Finestra ferma**: da 1024 px in su una sola finestra dell'app resta ferma accanto ai testi e mostra la scena della tappa in lettura, con un indicatore da 1 a 6; dentro la scena si anima il passo (la parola che si scrive, le keyword che compaiono, i link del piano che si disegnano, i titoli che arrivano, il testo che si scrive e si controlla, la bozza che arriva).
- **Parallasse e comparse**: la finestra dell'apertura sale dal basso con l'alone, i testi compaiono, le schede del resto entrano a velocità diverse.
- **Senza movimento**: con la riduzione del movimento, senza JavaScript o senza le animazioni a scorrimento del browser la pagina resta quella del modulo 58, completa.
- **Tecnica**: animazioni CSS native legate allo scorrimento e un solo piccolo componente client; nessuna libreria nuova (D-53).

## Task atomici

```yaml
- id: T-5901
  title: "Finestra ferma con le scene che cambiano"
  macrotask: "landing-motion"
  depends_on: [T-5802]

  objective: >
    Su schermi grandi far seguire il percorso in una sola finestra che resta ferma mentre le tappe scorrono.

  definition_of_done:
    - "components/marketing/landing-journey.tsx (componente client piccolo): da 1024 px in su e senza prefers-reduced-motion: reduce le scene stanno in una sola finestra ferma (position sticky) accanto ai testi delle tappe; la tappa in lettura (IntersectionObserver sui testi) decide la scena visibile, con un passaggio in dissolvenza, e un indicatore da 1 a 6 segna la tappa con aria-current=\"step\". Sotto i 1024 px, con la riduzione del movimento o senza JavaScript resta il layout del modulo 58, ogni tappa con la sua scena; il passaggio al layout con la finestra ferma avviene fuori dalla parte visibile all'arrivo della pagina."
    - "Dentro la scena attiva partono le animazioni del suo passo, solo CSS (transform e opacity): la parola che si scrive; le keyword che compaiono una dopo l'altra con le barre dei volumi che crescono; gli articoli che compaiono intorno alla pilastro con le linee dei link che si disegnano; H1 e H2 che compaiono e il pulsante che si illumina; le righe dell'editor che si riempiono con l'evidenziazione e la spunta del Controllo SEO; la bozza che arriva con i file che escono."
    - "Nessuna dipendenza nuova in package.json."

  acceptance_criteria:
    - id: AC-5901-1
      given: "un visitatore senza sessione su /it in una finestra di 1280×800 senza riduzione del movimento"
      when: "scorre fino al testo della quarta tappa"
      then: "la pagina ha una sola finestra delle scene in position sticky; la scena dei titoli SEO è visibile e le altre 5 non lo sono; l'indicatore ha aria-current=\"step\" sulla voce 4 e su nessun'altra"
    - id: AC-5901-2
      given: "lo stesso visitatore con prefers-reduced-motion: reduce"
      when: "apre /it e scorre la pagina"
      then: "nessun elemento ha position sticky dentro il percorso e ognuna delle 6 tappe ha la sua scena visibile accanto al testo"
    - id: AC-5901-3
      given: "un visitatore senza sessione su /it in una finestra di 390×844"
      when: "scorre fino in fondo alla pagina"
      then: "ognuna delle 6 tappe ha la sua scena visibile sotto il testo e la pagina non ha l'indicatore delle tappe"

  target_tests:
    - file: "tests/e2e/landing-motion.spec.ts"
      covers: [AC-5901-1, AC-5901-2, AC-5901-3]

  security_notes:
    - "Il componente non legge né scrive dati: solo la posizione dello scorrimento; nessuno script inline (CSP a nonce di T-505 invariata)."

  out_of_scope:
    - "Video, audio, scene interattive o cliccabili."

- id: T-5902
  title: "Parallasse, comparse e versione senza movimento"
  macrotask: "landing-motion"
  depends_on: [T-5901]

  objective: >
    Dare alla pagina il movimento delle pagine di lancio senza togliere nulla a chi non lo vede.

  definition_of_done:
    - "CSS della landing: animazioni legate allo scorrimento (animation-timeline con view() e scroll()) dentro @supports (animation-timeline: view()) e @media (prefers-reduced-motion: no-preference): la finestra dell'apertura che sale dal basso con l'alone (parallasse); titoli e testi delle tappe che compaiono; le 4 schede del resto che entrano a velocità diverse; sotto i 1024 px le scene che compaiono al loro arrivo."
    - "Fuori da quelle condizioni (browser senza animazioni a scorrimento, riduzione del movimento) ogni elemento è visibile nella sua posizione finale: nessun contenuto parte nascosto. Le animazioni usano solo transform e opacity, quindi non spostano il layout."
    - "Nessuna dipendenza nuova in package.json."

  acceptance_criteria:
    - id: AC-5902-1
      given: "un visitatore senza sessione su /it con prefers-reduced-motion: reduce"
      when: "la pagina è caricata, prima di scorrere"
      then: "document.getAnimations() non ha animazioni di elementi dentro main e i testi di tutte le 6 tappe e delle 4 schede hanno opacity 1"
    - id: AC-5902-2
      given: "un visitatore senza sessione su /it a 1280×800 senza riduzione del movimento"
      when: "scorre dall'inizio alla fine della pagina"
      then: "la somma dei layout shift registrati da PerformanceObserver è minore di 0,1 e, arrivato in fondo, i testi delle 6 tappe e delle 4 schede hanno opacity 1"

  target_tests:
    - file: "tests/e2e/landing-motion.spec.ts"
      covers: [AC-5902-1, AC-5902-2]

  security_notes:
    - "Solo CSS: nessuna risorsa esterna, nessuno script nuovo."

  out_of_scope:
    - "Animazioni nelle altre pagine pubbliche o nell'app."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-24 con l'utente (D-53): «percorso visivo in stile prodotto Apple con parallasse», scelta A (finestra ferma con le scene che cambiano), animazioni CSS native più un piccolo componente invece di GSAP o Motion.
- Rispetto alla divisione presentata in chat, la finestra ferma passa dal 58 al 59: senza movimento una finestra ferma non può cambiare scena, quindi il 58 tiene ogni scena accanto alla sua tappa (anche la versione senza movimento del 59).
- Gate umani: il link all'anteprima di Vercel per provare lo scorrimento e gli screenshot da computer e da telefono nei due temi, approvati dall'utente prima del merge.
- Ordine: dipende dal 58.
- Note di costruzione (2026-10-25, scelte dell'agente confermate dall'utente il 2026-10-25, D-56; screenshot del gate umano e anteprima di Vercel approvati lo stesso giorno):
  - «la finestra dell'apertura» è letta come la finestra ferma del percorso, la prima finestra dell'app che si incontra
    dopo l'apertura: sale dal basso con l'alone verde sulla stessa corsa della scena della prima tappa (stessa
    timeline di scorrimento, `view-timeline` con `timeline-scope`). L'apertura resta quella approvata nel 58, senza una
    finestra in più;
  - con la finestra ferma le scene delle tappe restano al loro posto ma invisibili (`visibility: hidden`), così il layout
    non cambia (layout shift 0 nelle prove) e il passaggio non tocca la parte visibile all'arrivo: la finestra è
    allineata alla scena della prima tappa e ne copia posizione e corsa. La finestra contiene una copia delle 6 scene,
    decorativa come quelle accanto ai testi: con la finestra ferma la pagina ha 12 elementi `data-scene`, uno solo
    visibile;
  - la tappa in lettura è quella il cui elemento dell'elenco (il testo della tappa, la scena accanto è nascosta) contiene
    la linea a metà della finestra del browser (IntersectionObserver con `rootMargin: -50% 0px -50% 0px`): gli elementi
    dell'elenco si toccano, quindi anche uno scorrimento a salti (tasto Fine, barra di scorrimento) trova sempre la
    tappa nuova; osservando i soli testi, con salti di 330 px le tappe 3 e 6 non diventavano mai attive;
  - l'indicatore sono 6 cerchi numerati sotto la finestra, decorativi come la finestra (`aria-hidden`) e non
    cliccabili, con `aria-current="step"` sulla tappa in lettura; la finestra sta ferma a metà dell'area sotto la barra
    in alto (`top: max(5rem, 50vh - 10.5rem)`);
  - ogni scena tiene la sua altezza (da 315 a 355 px a 1280 px) e le scene si alternano in dissolvenza (0,45 s), così
    la prima è identica a quella accanto al testo; le linee fra le tappe, con la finestra ferma, stanno solo nella
    colonna dei testi;
  - animazioni della scena attiva, solo transform e opacity, che ripartono quando la scena torna attiva: la parola si
    scrive con una copertura che scorre in 16 passi con il cursore sul bordo (nella finestra il campo e la pagina
    dell'editor hanno il fondo opaco, lo stesso colore sopra il fondo della pagina, perché la copertura nasconda davvero
    il testo), poi il cursore lampeggia; le righe dell'editor si riempiono in 5 passi con l'evidenziazione già presente
    (il colore dell'evidenziazione non si anima: né transform né opacity possono farlo su un testo in linea), poi le
    spunte del Controllo SEO una alla volta; gli altri passi come nel modulo;
  - le scene accanto ai testi salgono e compaiono al loro arrivo a ogni larghezza (anche da 1024 px senza JavaScript),
    non solo sotto i 1024 px; i testi delle tappe (numero, titolo, testo) compaiono salendo; le 4 schede entrano con
    la stessa corsa e distanze di 2 rem, 3,5 rem, 5 rem e 6,5 rem; tutte le animazioni legate allo scorrimento finiscono quando
    l'elemento è entrato del tutto, quindi in fondo alla pagina ogni testo è opaco;
  - il componente scrive `data-motion="on"` o `"off"` dopo l'idratazione: è l'aggancio del CSS e degli E2E, che
    aspettano la scelta del componente prima di guardare la pagina.
- Copertura non verificata (dichiarata): gli E2E sono stati visti rossi prima del codice, ma AC-5901-2, AC-5901-3,
  AC-5902-1 e AC-5902-2 solo per l'aggancio `data-motion` mancante (descrivono la pagina del 58, che già li
  soddisfaceva); nessuna prova con Safari, Firefox (senza animazioni legate allo scorrimento: finestra ferma senza
  comparse) o un telefono vero; layout shift misurati solo con Chromium; potere delle asserzioni (AT-1 Fase C) non
  eseguito.
