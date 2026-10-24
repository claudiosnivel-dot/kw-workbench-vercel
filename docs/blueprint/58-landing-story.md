# 58-landing-story — Macrotask `landing-story`

> Pagina principale con il percorso guidato (D-53), 2 di 3: la pagina racconta tutto quello che Titan SEO fa, dalla parola di partenza all'articolo pubblicato, in 6 tappe con le scene dell'app, nelle quattro lingue e nei due temi. Ancora senza movimento: la finestra ferma che cambia scena, la parallasse e le comparse sono il modulo 59.

## Obiettivo del macrotask
La landing di T-1801 parla solo della ricerca delle keyword («Dalle seed alle keyword pronte da esportare», quattro schede e tre passi) e usa ancora le parole che l'app ha cambiato (seed, sezioni). Non cita il piano editoriale con pilastri e articoli (19, 25), i titoli SEO con l'AI (35-36), gli articoli con l'AI, i loro controlli, l'export e WordPress (40-46, 52, 55-56), le lingue (47-51) e l'avvio rapido (23, 37). Dopo questo modulo:

- **Racconto completo**: apertura sul percorso intero, 6 tappe con il loro testo, quattro schede per il resto e la chiusura, in it, en, es-ES ed es-419, con titolo e descrizione per Google nuovi.
- **Scene dell'app**: accanto a ogni tappa una finestra dell'app ricostruita con HTML e CSS, con esempi del mercato della lingua; decorativa per i lettori di schermo, leggibile nel tema scuro e nel chiaro (57).

## Task atomici

```yaml
- id: T-5801
  title: "Testi e struttura della nuova pagina principale"
  macrotask: "landing-story"
  depends_on: [T-1801, T-4902, T-5701]

  objective: >
    Raccontare nella pagina principale tutto il percorso di Titan SEO, dalla parola di partenza all'articolo pubblicato, nelle quattro lingue.

  definition_of_done:
    - "components/marketing/landing.tsx, in quest'ordine: (1) apertura con eyebrow, un H1 sul percorso completo, l'introduzione («tu scegli, Titan SEO fa il resto») e i tre link di oggi (registrazione, prezzi della lingua, accesso); (2) un H2 del percorso guidato e un elenco ordinato di 6 tappe, ciascuna con un H3 e il suo testo: parola di partenza (avvio rapido con fino a 5 parole, progetto e argomento creati da soli), keyword (suggerimenti di ricerca, intento e tipo, filtro dei marchi, volumi dal Keyword Planner o dal fornitore dove il piano lo prevede, tieni o scarta), piano editoriale (pagine pilastro e articoli collegati, keyword raggruppate per pagina, link interni, stato di scrittura), titoli SEO con l'AI (H1 e H2 proposti con la keyword principale, da usare, scartare o correggere), articolo (scaletta, blocchi, domande frequenti e tabelle, Controllo SEO, frasi tipiche dell'AI evidenziate, dati da verificare, riscrittura di un blocco), pubblicazione (bozza su WordPress, oppure Word, HTML o Markdown con i dati strutturati); (3) un H2 per il resto con 4 schede H3: lingue e mercati (italiano, inglese, spagnolo di Spagna e dell'America Latina, con il paese), lavoro in team (workspace con ruoli e inviti), volumi di ricerca, export (CSV, Excel, Google Sheets dove il piano lo prevede, PDF del piano); (4) chiusura con il link di registrazione."
    - "Cataloghi marketing.landing e marketing.meta.home riscritti in it, en ed es-ES con la localizzazione semantica di docs/I18N-ES.md, e in es-419 le sole differenze: parole dell'app di oggi (parole di partenza, argomenti; mai seed né sezioni); nessuna affermazione su clienti, numeri, recensioni o certificazioni (T-1801); titoli e articoli presentati come proposte che l'utente rivede, mai come testi pubblicati da soli; nessuna promessa sui limiti giornalieri; le funzioni legate al piano con «dove il piano lo prevede»."
    - "La pagina usa solo i token del tema (T-5701): leggibile con data-theme DARK, LIGHT e SYSTEM."

  acceptance_criteria:
    - id: AC-5801-1
      given: "la pagina principale resa in ciascuna delle lingue it, en, es-ES ed es-419"
      when: "si leggono i suoi titoli"
      then: "c'è un solo H1; l'H2 del percorso è seguito da un elenco ordinato di 6 voci, ciascuna con un H3; l'H2 del resto ha 4 H3"
    - id: AC-5801-2
      given: "la pagina principale resa in italiano"
      when: "si leggono gli H3 e i testi delle tappe"
      then: "gli H3 delle tappe, nell'ordine, nominano la parola di partenza, le keyword, il piano editoriale, i titoli SEO, l'articolo e la pubblicazione; il testo della sesta tappa contiene «WordPress»; nessun testo della pagina contiene «seed» né «sezion»"
    - id: AC-5801-3
      given: "un visitatore senza sessione"
      when: "apre /it, /en, /es e /es-419"
      then: "ogni pagina ha come title e meta description i testi di marketing.meta.home della sua lingua, un link a /register, uno ai prezzi della lingua e uno a /login, e nessun link che comincia con /projects"

  target_tests:
    - file: "tests/component/landing.test.tsx"
      covers: [AC-5801-1, AC-5801-2]
    - file: "tests/e2e/landing.spec.ts"
      covers: [AC-5801-3]

  security_notes:
    - "A03 / CWE-79: solo testi dei cataloghi, resi come testo da React; nessun dato degli utenti nella pagina."

  out_of_scope:
    - "Movimento, finestra ferma e parallasse (modulo 59); pagina prezzi; testi legali; prove sociali (clienti, numeri, recensioni)."

- id: T-5802
  title: "Le sei scene dell'app"
  macrotask: "landing-story"
  depends_on: [T-5801]

  objective: >
    Far vedere accanto a ogni tappa come appare quel passo nell'app, con esempi del mercato della lingua.

  definition_of_done:
    - "components/marketing/landing-scenes.tsx: 6 scene ricostruite con HTML e CSS dentro una finestra dell'app (barra con i tre punti), una per tappa: il campo dell'avvio rapido con una parola di partenza; un elenco di keyword con intento e barra dei volumi, alcune scartate; il piano con una pagina pilastro, gli articoli collegati e le linee dei link; la scheda della proposta dei titoli con H1, tre H2 e «Usa questi titoli»; l'editor con il testo, una frase evidenziata, un dato da verificare e il riquadro del Controllo SEO; la bozza su WordPress con i file .docx, .html e .md."
    - "Esempi delle scene nel catalogo marketing.landing.scenes di ogni lingua: un tema credibile per il mercato (it «scarpe running», en «running shoes», es «zapatillas de running»), con keyword, titoli e frasi coerenti; nessun dato reale di utenti."
    - "Le scene sono decorative: aria-hidden, senza link, pulsanti, campi o tabindex; l'informazione sta nei testi delle tappe. Ogni tappa ha la sua scena accanto al testo, sotto il testo sotto i 1024 px, nei due temi."
    - "Nessuna immagine né video: solo elementi HTML e CSS con i token del tema."

  acceptance_criteria:
    - id: AC-5802-1
      given: "la pagina principale resa in spagnolo (es-ES)"
      when: "si leggono le scene"
      then: "ci sono 6 scene con aria-hidden, una per tappa nello stesso ordine, e la scena della prima tappa contiene la parola di partenza dell'esempio spagnolo di marketing.landing.scenes"
    - id: AC-5802-2
      given: "la pagina principale resa in ciascuna delle quattro lingue"
      when: "si cercano dentro le scene link, pulsanti, campi ed elementi con tabindex"
      then: "il conteggio è 0"
    - id: AC-5802-3
      given: "un visitatore senza sessione su /it e su /es, con il dispositivo sul tema chiaro e poi sul tema scuro"
      when: "axe analizza la pagina"
      then: "non ci sono violazioni serious né critical in nessuna delle quattro combinazioni"

  target_tests:
    - file: "tests/component/landing.test.tsx"
      covers: [AC-5802-1, AC-5802-2]
    - file: "tests/e2e/a11y.spec.ts"
      covers: [AC-5802-3]

  security_notes:
    - "Nessuna risorsa esterna: le scene non caricano immagini, font o script da altri domini (CSP di T-505 invariata)."

  out_of_scope:
    - "Movimento delle scene e finestra ferma che cambia scena (modulo 59); scene interattive."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-24 con l'utente (D-53): racconto completo, struttura in apertura, 6 tappe, resto e chiusura, scene ricostruite, stile «Notte smeraldo» con la versione chiara, testi onesti nelle quattro lingue.
- Gate umani: gli screenshot della pagina principale da computer (1280 px) e da telefono (390 px), nel tema scuro e nel chiaro, in it, en, es-ES ed es-419, e il link all'anteprima di Vercel, approvati dall'utente prima del merge (il merge va subito in produzione).
- Emendamenti prevedibili: AC-1801-2 in tests/e2e/landing.spec.ts cerca il vecchio H1 «Dalle seed alle keyword pronte da esportare»: l'asserzione passa al nuovo H1 (impacted-by T-5801).
- Ordine: dipende da 18, 49 e 57; viene prima del 59.
