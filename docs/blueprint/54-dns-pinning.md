# 54-dns-pinning — Macrotask `dns-pinning`

> WordPress (D-46, D-51): chiude il DNS rebinding lasciato dal modulo 46 come copertura non verificata, deciso dall'utente il 2026-10-21 («piccolo modulo per chiuderlo»). Oggi il nome host del sito si risolve e si controlla prima della richiesta, poi fetch lo risolve di nuovo per connettersi: fra le due risoluzioni un DNS ostile può passare a un indirizzo interno.

## Obiettivo del macrotask
Dopo il modulo 46 la prova del collegamento e l'invio a WordPress controllano che il nome host si risolva solo in indirizzi pubblici (`resolvesToPublicAddresses`), ma la connessione di fetch fa una seconda risoluzione che nessuno controlla. Dopo questo modulo:

- **Connessione agli indirizzi controllati**: un fetch il cui lookup di connessione risolve il nome una volta, rifiuta se anche un solo indirizzo non è pubblico e si connette solo agli indirizzi di quella risoluzione.
- **WordPress**: prova del collegamento e invio usano quel fetch; il controllo preliminare resta per rispondere subito senza aprire connessioni.

## Task atomici

```yaml
- id: T-5401
  title: "Fetch con la connessione agli indirizzi controllati"
  macrotask: "dns-pinning"
  depends_on: [T-4601]

  objective: >
    Far usare al controllo dell'indirizzo e alla connessione la stessa risoluzione del nome host.

  definition_of_done:
    - "lib/security/pinned-fetch.ts: createPinnedFetch({ isAllowed }) restituisce un fetch costruito con fetch e Agent dello stesso pacchetto undici (dipendenza diretta con versione esatta) il cui connect.lookup risolve il nome con dns.promises.lookup ({ all: true, verbatim: true }) una volta per connessione, rifiuta con un errore se non ci sono indirizzi o se uno non soddisfa isAllowed, altrimenti si connette solo agli indirizzi di quella risoluzione."
    - "pinnedFetch è createPinnedFetch con isAllowed uguale al controllo degli indirizzi pubblici di lib/security/public-address.ts (stesse reti riservate di T-4601, esportato da lì); un URL con l'host scritto come indirizzo IP o localhost (isIpOrLocalHostname) è rifiutato prima di ogni connessione, perché il lookup non viene chiamato per un IP letterale."

  acceptance_criteria:
    - id: AC-5401-1
      given: "un server HTTP locale su 127.0.0.1, dns.promises.lookup simulato che risponde 127.0.0.1 per pinned.test e un fetch di createPinnedFetch con isAllowed che accetta 127.0.0.1"
      when: "il fetch chiede http://pinned.test:{porta}/ping"
      then: "la risposta è 200, il server ha ricevuto una richiesta con l'header Host pinned.test:{porta} e dns.promises.lookup è stato chiamato una volta, con pinned.test"
    - id: AC-5401-2
      given: "dns.promises.lookup simulato che risponde 93.184.216.34 e 10.0.0.5 per wp.example.test"
      when: "pinnedFetch chiede https://wp.example.test/wp-json/wp/v2/users/me"
      then: "la promessa è rifiutata e dns.promises.lookup è stato chiamato una volta"
    - id: AC-5401-3
      given: "gli URL https://10.0.0.5/ e https://localhost/"
      when: "pinnedFetch li chiede"
      then: "entrambe le promesse sono rifiutate e dns.promises.lookup non è stato chiamato"

  target_tests:
    - file: "tests/unit/pinned-fetch.test.ts"
      covers: [AC-5401-1, AC-5401-2, AC-5401-3]

  security_notes:
    - "A01 / CWE-918: le richieste verso indirizzi scelti dall'utente si connettono solo a indirizzi pubblici controllati."
    - "CWE-367: controllo e uso dell'indirizzo nella stessa risoluzione, senza finestra fra i due (DNS rebinding)."

  out_of_scope:
    - "Altre richieste verso indirizzi esterni fissi (OpenRouter, DataForSEO, Google, Resend), che non sono scelti dall'utente."

- id: T-5402
  title: "WordPress con il fetch agli indirizzi controllati"
  macrotask: "dns-pinning"
  depends_on: [T-5401, T-4602]

  objective: >
    Togliere il DNS rebinding dalla prova del collegamento e dall'invio degli articoli a WordPress.

  definition_of_done:
    - "lib/integrations/wordpress.ts: wordPressRequest usa pinnedFetch al posto del fetch globale, con https, Basic auth, redirect manual e timeout di 10 s invariati; il controllo preliminare resolvesToPublicAddresses resta, così un nome già privato risponde WP_UNREACHABLE senza aprire connessioni; un rifiuto di pinnedFetch (indirizzo non pubblico alla connessione, rete, timeout) è WP_UNREACHABLE come prima."
    - "I test del modulo 46 (tests/integration/wordpress-connection.test.ts e wordpress-send.test.ts) simulano pinnedFetch al posto del fetch globale, con le stesse risposte e le stesse asserzioni (impacted-by T-5402)."

  acceptance_criteria:
    - id: AC-5402-1
      given: "un progetto collegato a https://wp.example.test e dns.promises.lookup simulato che risponde 93.184.216.34 alla prima chiamata e 10.0.0.5 dalla seconda in poi (DNS rebinding), con pinnedFetch vero"
      when: "un ADMIN del progetto chiede POST /api/projects/{id}/wordpress/test"
      then: "la risposta è 502 con code WP_UNREACHABLE e dns.promises.lookup è stato chiamato due volte"
    - id: AC-5402-2
      given: "lo stesso progetto con dns.promises.lookup simulato che risponde 93.184.216.34 alla prima chiamata e 10.0.0.5 dalla seconda in poi, e un articolo pronto"
      when: "un MEMBER del progetto chiede POST .../article/wordpress"
      then: "la risposta è 502 con code WP_UNREACHABLE e l'articolo ha ancora wp_post_id null"

  target_tests:
    - file: "tests/integration/wordpress-rebinding.test.ts"
      covers: [AC-5402-1, AC-5402-2]

  security_notes:
    - "A01 / CWE-918: stesse regole di rete del modulo 46, ora valide anche al momento della connessione."

  out_of_scope:
    - "Seguire i redirect (confermato dall'utente il 2026-10-21: l'indirizzo si scrive esatto, D-51)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalle risposte dell'utente del 2026-10-21 (D-51) alle domande sulle scelte del modulo 46: «piccolo modulo per chiuderlo» per il DNS rebinding, prima dei moduli delle tabelle.
- Gate umani: nessuno (nessuna schermata, nessuna baseline visiva toccata).
- Ordine: dipende solo dal modulo 46, già chiuso; viene prima del 55 e del 56 su indicazione dell'utente.
- Note di costruzione (2026-10-21, scelte dell'agente confermate dall'utente il 2026-10-22 con AskUserQuestion, D-52):
  - `undici` 8.11.2 come dipendenza diretta esatta: è la versione che il lockfile aveva già sotto jsdom (solo sviluppo),
    quindi nell'albero resta una sola undici e il lockfile cambia solo nel flag `dev`; nessun avviso di `npm audit` su
    undici. La 8.12.3, l'ultima, è uscita il 2026-10-19;
  - il fetch di undici restituisce la sua `Response`, che ha la stessa forma di quella globale: `PinnedFetch` accetta
    solo un URL (stringa o `URL`), perché una `Request` globale è dell'undici di Node e non di questo pacchetto;
  - il rifiuto è un errore `AddressNotAllowedError` senza nome host né indirizzi nel messaggio (CWE-532): diretto per
    un indirizzo IP o localhost nell'URL, come `cause` dell'errore di fetch quando lo rifiuta il lookup. Un indirizzo
    IP nell'URL è rifiutato da `createPinnedFetch` per ogni `isAllowed`, non solo da `pinnedFetch`, perché il lookup
    non lo vedrebbe mai;
  - il lookup risponde con tutti gli indirizzi quando Node li chiede (`all`, con la scelta automatica della famiglia,
    predefinita da Node 20) e con il primo altrimenti;
  - un `Agent` per ogni `createPinnedFetch`: le connessioni tenute aperte restano verso l'indirizzo controllato quando
    si sono aperte;
  - DNS simulato dei test in `tests/helpers/dns.ts` (`stubLookup`, anche con una risposta diversa per chiamata);
    `stubDns` dei test del 46 lo usa;
  - un test in più oltre agli AC: un nome che non si risolve è rifiutato con la causa `ENOTFOUND`, e un indirizzo IP
    nell'URL è rifiutato anche con un `isAllowed` che accetta tutto.
- Copertura non verificata (dichiarata): nessuna prova contro un DNS ostile vero (il rebinding è simulato con
  `dns.promises.lookup`); il ramo del lookup senza `all` non ha un test; il potere delle asserzioni (AT-1 Fase C) non è
  eseguito.
