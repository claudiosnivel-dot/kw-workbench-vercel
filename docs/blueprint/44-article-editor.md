# 44-article-editor — Macrotask `article-editor`

> Articoli con l'AI (D-46), modulo 5 di 7: l'avvio dal pannello della pagina e la pagina dedicata dove l'utente legge, controlla e modifica l'articolo a blocchi, con la riscrittura di un blocco, il rapporto SEO e i segnaposto immagine.

## Obiettivo del macrotask
Dopo i moduli 40-43 il lavoro scrive e controlla l'articolo, ma nessuno può vederlo. Dopo questo modulo:

- **Avvio**: nel pannello della pagina del piano «Scrivi l'articolo con l'AI» apre una finestra con la lunghezza (Breve, Media, Lunga; default secondo la pagina) e le note, poi porta all'editor; con un articolo esistente il pannello mostra «Apri l'articolo».
- **Editor** a `/projects/<id>/plan/pages/<pagina>/article`: H1, avanzamento, title, meta description e slug con i contatori, poi i blocchi formattati con i tratti AI in giallo e i dati da verificare in arancio; «Modifica» apre un blocco come testo con salvataggio automatico; «Riscrivi questo blocco» con un'istruzione facoltativa; rapporto «Controllo SEO»; riquadri dei segnaposto immagine con «Copia prompt».
- **Accensione**: con questo modulo il root admin può accendere gli articoli dalla card.

## Task atomici

```yaml
- id: T-4401
  title: "Avvio dal pannello e lettura dell'articolo"
  macrotask: "article-editor"
  depends_on: [T-4302, T-2505, T-3603]

  objective: >
    Far partire un articolo dalla pagina del piano e seguirne la scrittura blocco per blocco, con i punti da controllare
    già evidenziati.

  definition_of_done:
    - "Pannello della pagina (T-2505): con articoli accesi e il permesso strategy.write, «Scrivi l'articolo con l'AI» apre una finestra con la lunghezza (default LONG per HUB, SHORT per content_type local, MEDIUM negli altri casi), le note (fino a 1000 caratteri) e la stima delle richieste; «Scrivi» chiama POST .../article e apre l'editor. Con un articolo esistente il pannello mostra «Apri l'articolo»; una nuova generazione dall'editor chiede conferma perché sostituisce il testo."
    - "app/projects/[id]/plan/pages/[pageId]/article/page.tsx: pagina e articolo risolti nel progetto del workspace (404 altrimenti); intestazione con H1, stato e avanzamento del lavoro (polling ogni 3 s finché è attivo, come T-2404), title, meta description e slug con i contatori 60 e 155; blocchi in ordine resi dal Markdown con i link interni come link alle pagine del piano; le corrispondenze dei checks evidenziate (ai_pattern in giallo, to_verify in arancio, con la regola nel title); blocchi ancora vuoti con «Sto scrivendo…»; errore del lavoro con il testo del catalogo del suo error_code."
    - "Riquadri dei segnaposto immagine dopo il loro blocco, con scopo, testo alternativo, nome file e prompt, e «Copia prompt»; testi article it ed en."

  acceptance_criteria:
    - id: AC-4401-1
      given: "il pannello di uno spoke con articoli accesi, un MEMBER e un fetch simulato"
      when: "il MEMBER clicca «Scrivi l'articolo con l'AI», lascia la lunghezza proposta e clicca «Scrivi»"
      then: "la lunghezza proposta è Media; la POST inviata ha length MEDIUM; il router apre /projects/P/plan/pages/<pagina>/article"
    - id: AC-4401-2
      given: "l'editor reso con un articolo READY di 2 blocchi, uno con un ai_pattern e uno con un to_verify, e 2 segnaposto immagine"
      when: "l'utente legge la pagina e clicca «Copia prompt» sul primo segnaposto"
      then: "le due corrispondenze sono evidenziate con le classi del giallo e dell'arancio; gli appunti ricevono il prompt del primo segnaposto"
    - id: AC-4401-3
      given: "un articolo GENERATING con il primo blocco scritto e il secondo vuoto"
      when: "l'editor si apre e il polling riceve il lavoro completed"
      then: "prima il secondo blocco mostra «Sto scrivendo…», dopo il polling mostra il suo testo"
    - id: AC-4401-4
      given: "l'articolo di un progetto di un altro workspace"
      when: "un MEMBER apre il suo indirizzo"
      then: "la risposta è 404"

  target_tests:
    - file: "tests/component/article-start-dialog.test.tsx"
      covers: [AC-4401-1]
    - file: "tests/component/article-editor-read.test.tsx"
      covers: [AC-4401-2, AC-4401-3]
    - file: "tests/e2e/article-editor.spec.ts"
      covers: [AC-4401-4]

  security_notes:
    - "A01 / CWE-639: l'editor risolve pagina e articolo nel progetto del workspace della sessione."
    - "A03 / CWE-79: il Markdown si rende con react-markdown senza HTML grezzo; i link ammessi sono solo quelli verso le pagine del piano."

  out_of_scope:
    - "Modifica a più persone in contemporanea: vale l'ultima versione salvata con il controllo di version (T-4402)."

- id: T-4402
  title: "Modifica, riscrittura di un blocco e rapporto SEO"
  macrotask: "article-editor"
  depends_on: [T-4401]

  objective: >
    Permettere all'utente di correggere il testo, di far riscrivere un solo blocco e di vedere cosa manca per la SEO,
    senza perdere modifiche.

  definition_of_done:
    - "PATCH .../article con { version, sections?: [{ id, body }], meta_title?, meta_description?, slug? }: version diversa → 409 ARTICLE_VERSION_CONFLICT; body ripulito con il sanitizer di T-4201; un blocco salvato diventa edited true e i suoi checks e seo_report si ricalcolano (T-4301, T-4302) senza chiamare il modello; meta e slug con i limiti di T-4102 (400 VALIDATION_ERROR)."
    - "«Modifica» apre il blocco in un campo di testo (Markdown con grassetto, elenchi e link alle pagine del piano), con salvataggio automatico 1 s dopo l'ultima modifica e «Salvato» o l'errore; il conflitto 409 mostra «Questo articolo è stato modificato altrove: ricarica la pagina»."
    - "«Riscrivi questo blocco» con un'istruzione facoltativa (fino a 500 caratteri): POST .../article/sections/[sectionId]/rewrite crea un lavoro con scope SECTION entro sectionRewritesPerWorkspaceDaily e il tetto della piattaforma (429 RATE_LIMITED); un lavoro attivo → 409 JOB_ALREADY_ACTIVE; il blocco riscritto torna edited false."
    - "Riquadro «Controllo SEO»: keyword usate e mancanti per blocco, densità della keyword principale, link interni presenti e obbligatori mancanti, lunghezze di title e meta, numero di segnaposto da verificare aperti; testi it ed en."

  acceptance_criteria:
    - id: AC-4402-1
      given: "un articolo con version 3 e un blocco"
      when: "un MEMBER invia PATCH con version 3 e un nuovo body con '<b>x</b> testo **grassetto**', poi con version 3 di nuovo"
      then: "la prima risposta è 200 con version 4, il body salvato non contiene '<b>' e contiene '**grassetto**', il blocco è edited; la seconda è 409 ARTICLE_VERSION_CONFLICT"
    - id: AC-4402-2
      given: "sectionRewritesPerWorkspaceDaily 1 e una riscrittura già fatta oggi nel workspace"
      when: "un MEMBER chiede «Riscrivi questo blocco», poi il root admin"
      then: "il MEMBER riceve 429 RATE_LIMITED e nessun lavoro nuovo; il root admin riceve 202 con un lavoro di scope SECTION"
    - id: AC-4402-3
      given: "l'editor reso con un seo_report che segnala la keyword 'noleggio letto ospedaliero roma' mancante e il link alla pagina pilastro mancante"
      when: "l'utente apre il riquadro «Controllo SEO»"
      then: "il riquadro elenca la keyword mancante e il link mancante con l'H1 della pagina pilastro"

  target_tests:
    - file: "tests/integration/article-edit.test.ts"
      covers: [AC-4402-1, AC-4402-2]
    - file: "tests/component/article-seo-report.test.tsx"
      covers: [AC-4402-3]

  security_notes:
    - "A04 / CWE-362: version dell'articolo per non sovrascrivere modifiche concorrenti."
    - "A03 / CWE-79: anche il testo dell'utente passa dal sanitizer prima del salvataggio."

  out_of_scope:
    - "Storico delle versioni del testo e annullamento oltre l'ultima modifica."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): pagina dedicata a blocchi con salvataggio automatico e «Riscrivi questa sezione»; lunghezza predefinita per tipo e modificabile; segnaposto immagine con «Copia prompt».
- Gate umani: nessuno sulle baseline visive esistenti (pagina nuova). Dopo il merge il root admin accende gli articoli dalla card.
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): default LONG per la pagina pilastro, SHORT per le pagine locali, MEDIUM per le altre; polling ogni 3 s; salvataggio automatico dopo 1 s; un nuovo avvio dall'editor chiede conferma.
- Emendamento dichiarato (2026-10-18, D-47, prima della costruzione): lo spagnolo (moduli 47-51) si costruisce prima di questo modulo, quindi ogni testo nuovo va nei cataloghi it, en ed es-ES, con le differenze in es-419, e il controllo di parità di T-4702 vale anche per i namespace di questo modulo.
- Note di costruzione (2026-10-20, scelte dell'agente confermate dall'utente lo stesso giorno con AskUserQuestion, D-49, insieme al nome «Riscrivi questo blocco»; le due scelte rimaste aperte sono diventate il modulo 52):
  - l'editor trova la pagina in qualunque versione del piano del progetto (l'articolo segue la pagina con «Rigenera», T-2502); senza pagina o senza articolo la risposta è 404 come per un progetto di un altro workspace;
  - «Apri l'articolo» compare a chi legge il progetto; «Scrivi l'articolo con l'AI» solo con gli articoli accesi, la chiave e strategy.write; la stima nella finestra è quella dell'avvio (H2 più 3, più il 30%);
  - la nuova generazione dall'editor usa la stessa finestra con l'avviso che il testo attuale sarà sostituito e il pulsante «Sostituisci e scrivi»: è la conferma;
  - i link interni del testo diventano link alla pagina del piano con il suo pannello aperto (`/projects/<id>/plan?page=<pagina>`); ogni altro indirizzo resta testo;
  - title, meta description e slug si modificano nell'intestazione con lo stesso salvataggio automatico dei blocchi (1 s); lo slug ammette lettere minuscole e cifre unite da trattini, fino a 80 caratteri;
  - PATCH con un lavoro attivo sull'articolo → 409 JOB_ALREADY_ACTIVE (il motore sta scrivendo); un blocco vuoto dopo la pulizia → 400 VALIDATION_ERROR; un id di blocco che non è dell'articolo → 400 VALIDATION_ERROR;
  - emendamento dichiarato del DoD di T-4402, dell'obiettivo e di AC-4402-2: il pulsante si chiama «Riscrivi questo blocco» («Rewrite this block», «Reescribir este bloque») e non «Riscrivi questa sezione», perché «sezione» e «section» sono tra le parole vietate nei testi del cliente da T-2604 (AC-2604-1, `tests/unit/plain-language.test.ts`), e l'editor parla già di blocchi; la rotta resta `.../article/sections/[sectionId]/rewrite`;
  - «Riscrivi questo blocco»: un blocco che non è dell'articolo → 404 ARTICLE_NOT_FOUND; il tetto della piattaforma deve avere posto per 3 richieste (la riscrittura e quella eventuale dei controlli, più il 30%) e non consuma nulla, poi il limite del workspace consuma una riscrittura (chiave `ai-section-rewrites:workspace:<id>`, 24 ore), root admin escluso da entrambi (D-43); l'avvio della riscrittura fa crescere la version dell'articolo, così una modifica aperta prima della riscrittura non la sovrascrive.
