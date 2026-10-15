# 29-ux-account-polish — Macrotask `ux-account-polish`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 2 di 7: le sezioni Preferenze e Collegamenti dell'area «Il tuo account» (modulo 28) diventano più semplici da usare.

## Obiettivo del macrotask
Dopo il modulo 28 le preferenze chiedono ancora un «Salva» e la card di Google Sheets mostra dettagli tecnici (scope, tipo di token). Dopo questo modulo:

- **Preferenze**: tema, testo più grande e colori per daltonismo si salvano a ogni scelta, con «Salvato»; c'è anche la lingua, che resta pure nel menu dell'utente.
- **Collegamenti**: Google Sheets in tre stati detti con parole semplici (non collegato, collegato come…, da ricollegare), senza scope né tipo di token.

## Task atomici

```yaml
- id: T-2901
  title: "Preferenze salvate da sole, con la lingua"
  macrotask: "ux-account-polish"
  depends_on: [T-2801, T-1104, T-1301]

  objective: >
    Togliere il pulsante Salva dalle preferenze: ogni scelta si salva subito, con un esito visibile, e la lingua si
    sceglie anche qui.

  definition_of_done:
    - "components/personalization-settings-card.tsx: niente pulsante Salva; ogni scelta (tema, testo più grande, colori per daltonismo) invia subito PATCH /api/user/preferences con il solo campo cambiato; con la risposta ok compare «Salvato» in un elemento role status e parte router.refresh; con un errore la scelta torna al valore precedente e il messaggio compare in un elemento role alert; durante l'invio i controlli sono disabilitati."
    - "Campo «Lingua» (Italiano, English) nella stessa card, con la richiesta del selettore del menu (POST /api/locale con { locale }, T-1301); il selettore del menu resta."
    - "Emendamento dichiarato: AC-1104-3 (modulo 11) — con un utente dedicato al test (non quello delle baseline visive), scelto il tema Chiaro in /account/preferences e tornati alla home, html ha data-theme 'LIGHT'; il test riporta il tema a DARK alla fine."

  acceptance_criteria:
    - id: AC-2901-1
      given: "PersonalizationSettingsCard con tema DARK e fetch simulato che risponde 200"
      when: "si sceglie «Chiaro»"
      then: "fetch è chiamato 1 volta con PATCH /api/user/preferences e corpo { themeMode: 'LIGHT' }, un elemento role status contiene «Salvato» e il DOM non contiene un pulsante «Salva»"
    - id: AC-2901-2
      given: "la stessa card con testo normale e fetch simulato che risponde 500"
      when: "si attiva il testo più grande"
      then: "l'interruttore torna non selezionato e un elemento role alert contiene il messaggio d'errore"
    - id: AC-2901-3
      given: "la card con lingua it e fetch simulato che risponde 200"
      when: "si sceglie English"
      then: "fetch è chiamato 1 volta con POST /api/locale e corpo { locale: 'en' }"

  target_tests:
    - file: "tests/component/personalization-autosave.test.tsx"
      covers: [AC-2901-1, AC-2901-2, AC-2901-3]

  security_notes:
    - "Nessuna superficie nuova: PATCH /api/user/preferences e POST /api/locale accettano solo i letterali ammessi e scrivono sull'utente della sessione, mai su un id del corpo (CWE-639, T-1301)."

  out_of_scope:
    - "Nuove preferenze oltre a quelle di oggi."

- id: T-2902
  title: "Collegamenti: Google Sheets in parole semplici"
  macrotask: "ux-account-polish"
  depends_on: [T-2801, T-906, T-907]

  objective: >
    Mostrare il collegamento a Google Sheets con tre stati chiari e senza dettagli tecnici.

  definition_of_done:
    - "components/google-sheets-personal-card.tsx: non collegato («Collega Google Sheets»); collegato («Collegato come {email}» e «Scollega»); da ricollegare, quando lo stato è reauth_required, needsReconnect è vero o lo scope è più ampio di drive.file («Da ricollegare», una riga sul perché e «Ricollega»); spariscono le righe Stato, Email e Scope e il tipo di token; i messaggi del ritorno da Google restano quelli di oggi."
    - "Introduzione della card: l'export su Google Sheets usa il collegamento personale, ogni membro collega il proprio account (la frase oggi in workspace.page.sheetsNote, che sparisce con T-3101)."

  acceptance_criteria:
    - id: AC-2902-1
      given: "la card con connected true, needsReconnect false, connectedEmail 'mario@gmail.com' e scope drive.file"
      when: "si rende"
      then: "il testo «Collegato come mario@gmail.com» e il pulsante «Scollega» sono visibili e il DOM non contiene 'drive.file' né «Scope:»"
    - id: AC-2902-2
      given: "la card con connected true e needsReconnect true"
      when: "si rende"
      then: "il testo «Da ricollegare» è visibile e c'è 1 elemento «Ricollega» che porta a /api/integrations/google-sheets/connect"
    - id: AC-2902-3
      given: "la card con connected false"
      when: "si rende"
      then: "c'è 1 elemento «Collega Google Sheets» che porta a /api/integrations/google-sheets/connect e 0 pulsanti «Scollega»"

  target_tests:
    - file: "tests/component/google-sheets-personal-card.test.tsx"
      covers: [AC-2902-1, AC-2902-2, AC-2902-3]

  security_notes:
    - "Nessuna superficie nuova: la card usa le rotte di T-906 e T-907; l'email del collegamento è quella dell'utente della sessione."

  out_of_scope:
    - "Altri collegamenti oltre a Google Sheets."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41), sezione «Il tuo account» approvata con i mockup.
- Gate umani: nessuno; nessuna pagina delle baseline visive. Il test di AC-1104-3 passa a un utente dedicato perché il tema ora si salva davvero.
- Scelte dell'agente da confermare (rilievi): «Salvato» dopo ogni scelta; la lingua sia nel menu sia in Preferenze; nessuna conferma prima di «Scollega» oltre a quella di oggi.
