# 70-local-tips — Macrotask `local-tips`

> La pagina locale con molte città dà all'utente due consigli e gli strumenti per scegliere le città che contano (D-62).

## Obiettivo del macrotask
Ragionamento dell'utente del 2026-11-15: con un'attività solo locale le città che non interessano si scartano dalle keyword estratte; con un'azienda che lavora in tutta Italia si fanno pagine specifiche per le città che servono, non per tutte. Automatizzarlo è quasi impossibile, quindi meglio «mettere un avviso, guidare l'utente affinché possa fare un lavoro SEO migliore dandogli dei tips». In «Noleggio magnetoterapia» la pagina locale ha più di 100 città. Questo modulo realizza la schermata 4 delle bozze approvate («per ora va bene»): avviso in testa al piano, consigli nel pannello della pagina locale, scarto delle città scelte e «Fanne una pagina» accanto alle città.

## Task atomici

```yaml
- id: T-7001
  title: "Consigli sulla pagina locale e scarto delle città scelte"
  macrotask: "local-tips"
  depends_on: [T-6701, T-2401, T-2505]

  objective: >
    Avvisare l'utente quando la pagina locale raccoglie molte città, spiegargli le due strade e fargli scartare in un
    colpo le città che non gli servono.

  definition_of_done:
    - "LOCAL_TIPS_MIN_PLACES = 15 (lib/modules/strategy): una pagina con content type local e almeno 15 keyword mostra i consigli. In testa al piano un avviso «La pagina locale ha N città» con «Consigli», che apre il suo pannello; nessun avviso su una versione precedente."
    - "components/plan/page-panel.tsx, pagina local con almeno 15 keyword: riquadro «N città in una sola pagina» con i due consigli delle bozze («Lavori in una zona sola?» e «Lavori in tutta Italia?») e il pulsante «Scegli le città da scartare»."
    - "Dialogo «Scegli le città da scartare» (modale con useModalFocus): le keyword della pagina locale per volume e poi priorità, con caselle e «Scarta le città scelte», che chiama l'azione di scarto in blocco di oggi (/api/projects/[id]/results, T-2401) con i source_keyword_id delle keyword scelte (al massimo 1000; le keyword senza source_keyword_id non si possono scegliere). Dopo la risposta il dialogo dice «Le città scartate escono dal piano alla prossima «Rigenera»» e il piano non cambia."
    - "Testi nei cataloghi it, en, es-ES (es-419 solo se diverso); a 390 px riquadro e dialogo senza scorrimento orizzontale, pulsanti alti almeno 44 px."

  acceptance_criteria:
    - id: AC-7001-1
      given: "un piano con una pagina local di 16 keyword"
      when: "si apre il piano e poi il pannello della pagina locale"
      then: "l'avviso dice «La pagina locale ha 16 città»; il pannello mostra i due consigli e «Scegli le città da scartare»"
    - id: AC-7001-2
      given: "il dialogo «Scegli le città da scartare» con tre città scelte"
      when: "si preme «Scarta le città scelte»"
      then: "parte una sola richiesta all'azione di scarto in blocco con i tre source_keyword_id; dopo la risposta il dialogo mostra il messaggio sulla prossima «Rigenera»"
    - id: AC-7001-3
      given: "un piano con una pagina local di 14 keyword"
      when: "si apre il piano"
      then: "nessun avviso sulle città e nessun riquadro dei consigli nel pannello della pagina locale"

  target_tests:
    - file: "tests/component/local-tips.test.tsx"
      covers: [AC-7001-1, AC-7001-2, AC-7001-3]

  security_notes:
    - "A01 / CWE-639: lo scarto usa la rotta di oggi dietro il permesso e il progetto di T-2401; gli id vengono dalle keyword del piano del progetto aperto."
    - "A04 / CWE-770: al massimo 1000 id per richiesta, il limite di oggi (MAX_BULK_IDS)."

  out_of_scope:
    - "Togliere subito le città scartate dal piano: escono alla prossima «Rigenera»."
    - "Consigli dell'AI sulle città."
    - "Un avviso nella lista delle keyword prima del piano: i luoghi si riconoscono solo nel lavoro di piano."

- id: T-7002
  title: "«Fanne una pagina» accanto alle città"
  macrotask: "local-tips"
  depends_on: [T-7001, T-6801]

  objective: >
    Far nascere una pagina locale propria per una città dove l'utente ha sedi o clienti, partendo dalla pagina locale.

  definition_of_done:
    - "Nel riquadro dei consigli della pagina locale le prime 5 città per volume e poi priorità hanno «Fanne una pagina», e il dialogo «Scegli le città da scartare» lo ha accanto a ogni città: parte create_page (T-6801) con keywordIds [la città], hubPageId l'hub della pagina locale e contentType local, senza h1 (lo propone il piano con i titoli locali di oggi)."
    - "Dopo la creazione il pannello si apre sulla pagina nuova; la pagina locale perde la città."

  acceptance_criteria:
    - id: AC-7002-1
      given: "il pannello di una pagina local con 16 keyword sotto l'hub H, fra cui «noleggio magnetoterapia roma»"
      when: "si preme «Fanne una pagina» accanto a «noleggio magnetoterapia roma»"
      then: "parte create_page con keywordIds [la sua keyword], hubPageId l'id di H e contentType local; dopo la risposta il pannello mostra la pagina nuova"
    - id: AC-7002-2
      given: "una strategia con una pagina local sotto l'hub H"
      when: "si invia create_page con una sua keyword, hubPageId l'id di H e contentType local"
      then: "la risposta è 200; la pagina nuova è uno SPOKE di H con content type local e un H1 calcolato che contiene «roma»; la pagina locale non ha più quella keyword"

  target_tests:
    - file: "tests/component/local-tips.test.tsx"
      covers: [AC-7002-1]
    - file: "tests/integration/strategy-operations.test.ts"
      covers: [AC-7002-2]

  security_notes:
    - "Nessuna rotta nuova: usa create_page di T-6801."

  out_of_scope:
    - "Creare pagine per più città in un colpo."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla conversazione del 2026-11-15 (D-62): consigli invece dell'automazione sulle città, bozze approvate («per ora va bene», schermata 4).
- Scelte dell'agente da confermare: soglia di 15 città; consigli solo nel piano (non nella lista delle keyword, dove i luoghi non sono ancora riconosciuti); scarto con la rotta di oggi e città fuori dal piano solo alla prossima «Rigenera»; «Fanne una pagina» accanto alle prime 5 città nel riquadro e a tutte nel dialogo.
- Ordine: dopo il 69 (dipende da 67 e 68); T-7002 dopo T-7001.
