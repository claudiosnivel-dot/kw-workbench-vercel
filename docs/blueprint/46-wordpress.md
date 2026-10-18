# 46-wordpress — Macrotask `wordpress`

> Articoli con l'AI (D-46), modulo 7 di 7: il collegamento di un progetto a un sito WordPress con le password per le applicazioni, senza plugin, e l'invio dell'articolo come bozza. Il plugin Titan SEO per WordPress si valuterà più avanti (scelta dell'utente del 2026-10-18).

## Obiettivo del macrotask
Dopo il modulo 45 l'articolo esce con la copia o i file. L'utente vuole caricarlo su WordPress senza passaggi a mano. WordPress dalla 5.6 ha l'API REST con le password per le applicazioni: non serve installare nulla. Dopo questo modulo:

- **Collegamento**: nelle impostazioni del progetto indirizzo del sito, utente e password per le applicazioni (salvata cifrata), con «Prova collegamento».
- **Invio**: «Invia a WordPress» crea l'articolo come bozza con titolo, contenuto, slug ed estratto; un secondo invio aggiorna la stessa bozza; l'editor mostra il link alla bozza.

## Task atomici

```yaml
- id: T-4601
  title: "Collegamento a WordPress con le password per le applicazioni"
  macrotask: "wordpress"
  depends_on: [T-4001, T-2602]

  objective: >
    Collegare un progetto al suo sito WordPress senza plugin, conservando la password in modo cifrato e verificando il
    collegamento prima di usarlo.

  definition_of_done:
    - "Migrazione additiva 0051_wordpress: projects con wp_site_url (fino a 300), wp_username (fino a 120) e wp_app_password_encrypted (cifrata con encryptSecret come le altre credenziali); articles con wp_post_id e wp_post_url."
    - "PUT /api/projects/[id]/wordpress { siteUrl, username, appPassword } con project.update: siteUrl solo https assoluto senza credenziali, query o frammento e con un nome host che non è un indirizzo IP né localhost; password per le applicazioni con gli spazi tolti, da 24 caratteri alfanumerici; la password non torna mai nelle risposte (solo «configurata: sì»). DELETE scollega e cancella i tre campi."
    - "POST /api/projects/[id]/wordpress/test: GET {siteUrl}/wp-json/wp/v2/users/me?context=edit con Basic auth, timeout 10 s, senza seguire redirect verso un altro host; prima della richiesta il nome host si risolve e si rifiuta se un indirizzo è privato, di loopback, link-local o riservato (CWE-918); esito ok con il nome dell'utente WordPress e se può pubblicare (capabilities edit_posts), oppure WP_AUTH_FAILED (401/403), WP_NOT_FOUND (404, API REST assente), WP_UNREACHABLE (rete, timeout, indirizzo rifiutato)."
    - "Impostazioni del progetto: blocco «WordPress» con i tre campi, «Prova collegamento» con l'esito e la guida per creare una password per le applicazioni (Utenti → Profilo → Password per le applicazioni); testi it ed en."

  acceptance_criteria:
    - id: AC-4601-1
      given: "un OWNER del progetto"
      when: "invia PUT /wordpress con siteUrl 'https://blog.esempio.it', username 'redazione' e una password per le applicazioni di 24 caratteri scritta a gruppi di 4 con gli spazi"
      then: "la risposta è 200 senza la password; nel database wp_app_password_encrypted è diverso dalla password e decryptSecret restituisce la password senza spazi"
    - id: AC-4601-2
      given: "un OWNER del progetto"
      when: "invia PUT /wordpress con siteUrl 'http://blog.esempio.it', poi 'https://127.0.0.1', poi 'https://localhost'"
      then: "tutte le risposte sono 400 VALIDATION_ERROR e il progetto non cambia"
    - id: AC-4601-3
      given: "un collegamento salvato e un WordPress simulato che risponde a users/me con 200 e capabilities edit_posts, poi con 401, poi un nome host che si risolve in 10.0.0.5"
      when: "l'OWNER chiede POST /wordpress/test in ciascun caso"
      then: "le risposte sono ok con il nome dell'utente, WP_AUTH_FAILED e WP_UNREACHABLE; nel terzo caso il fetch verso il sito non è stato chiamato"

  target_tests:
    - file: "tests/integration/wordpress-connection.test.ts"
      covers: [AC-4601-1, AC-4601-2, AC-4601-3]

  security_notes:
    - "A02 / CWE-312: password per le applicazioni cifrata a riposo, mai in risposte o log."
    - "A10 / CWE-918: solo https verso nomi host pubblici, con la risoluzione controllata prima di ogni richiesta e senza redirect verso altri host."
    - "A01 / CWE-285: collegamento modificabile solo con project.update."

  out_of_scope:
    - "Plugin Titan SEO per WordPress, campi di Yoast e Rank Math, OAuth di WordPress.com."

- id: T-4602
  title: "Invio dell'articolo a WordPress come bozza"
  macrotask: "wordpress"
  depends_on: [T-4601, T-4502]

  objective: >
    Portare l'articolo nel sito WordPress con un clic, come bozza da rileggere nel CMS, e aggiornarla se l'articolo
    cambia.

  definition_of_done:
    - "POST .../article/wordpress con strategy.write: senza collegamento → 409 WP_NOT_CONFIGURED; prima volta POST {siteUrl}/wp-json/wp/v2/posts con status draft, title (H1), content (HTML di T-4501), slug ed excerpt (meta_description); con wp_post_id già salvato POST /posts/{id} per aggiornare la stessa bozza (se WordPress risponde 404 se ne crea una nuova); salva wp_post_id e wp_post_url (link della risposta); stesse protezioni di rete di T-4601; errori WP_AUTH_FAILED, WP_UNREACHABLE e WP_REJECTED (altro status, con il solo status nel log)."
    - "Editor: «Invia a WordPress» (con la conferma dei segnaposto di T-4502), poi «Bozza su WordPress» con il link; dopo un invio il pulsante diventa «Aggiorna la bozza su WordPress». Nota nella guida: il JSON-LD dentro il contenuto resta solo se l'utente WordPress ha il permesso unfiltered_html (amministratore)."

  acceptance_criteria:
    - id: AC-4602-1
      given: "un collegamento salvato, un articolo READY e un WordPress simulato che risponde 201 con id 57 e link 'https://blog.esempio.it/?p=57'"
      when: "un MEMBER invia POST .../article/wordpress"
      then: "la richiesta a WordPress ha status draft, title uguale all'H1, slug e excerpt dell'articolo e Basic auth; l'articolo ha wp_post_id 57 e wp_post_url 'https://blog.esempio.it/?p=57'"
    - id: AC-4602-2
      given: "lo stesso articolo con wp_post_id 57"
      when: "il MEMBER invia di nuovo POST .../article/wordpress"
      then: "la richiesta va a /wp-json/wp/v2/posts/57 e non viene creata un'altra bozza"
    - id: AC-4602-3
      given: "un progetto senza collegamento, poi un WordPress simulato che risponde 401"
      when: "un MEMBER invia POST .../article/wordpress in ciascun caso"
      then: "le risposte sono 409 WP_NOT_CONFIGURED e 502 WP_AUTH_FAILED; il log non contiene la password né il contenuto dell'articolo"

  target_tests:
    - file: "tests/integration/wordpress-send.test.ts"
      covers: [AC-4602-1, AC-4602-2, AC-4602-3]

  security_notes:
    - "A10 / CWE-918: stesse regole di rete del collegamento a ogni invio."
    - "A09 / CWE-532: nei log solo id del progetto, status di WordPress ed esito."

  out_of_scope:
    - "Pubblicazione diretta senza bozza, categorie, tag, immagini in evidenza e campi SEO dei plugin."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal brainstorming del 2026-10-18 (D-46): connettore WordPress senza plugin con le password per le applicazioni, articolo come bozza; plugin più avanti (scelta dell'utente).
- Gate umani: nessuno; una prova con un sito WordPress reale resta all'utente (credenziali sue).
- Scelte dell'agente (confermate dall'utente il 2026-10-18 con l'approvazione del modulo, «approvo tutto»): un sito WordPress per progetto; solo bozze; un secondo invio aggiorna la stessa bozza; nomi host che sono indirizzi IP rifiutati.
