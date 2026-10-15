# 32-ux-invites — Macrotask `ux-invites`

> Seconda parte della nuova esperienza d'uso (D-41), modulo 5 di 7: gli inviti al workspace funzionano anche senza email, con un link da copiare, e quelli scaduti si rinnovano (funzioni W1 e W2 del brainstorming del 2026-10-14).

## Obiettivo del macrotask
Oggi un invito parte solo per email e, senza invio delle email (D-11), la richiesta finisce con 503 EMAIL_UNAVAILABLE: in produzione non si può invitare nessuno. Gli inviti scaduti spariscono dall'elenco. Dopo questo modulo:

- **Link da copiare (W1)**: ogni invito mostra a chi invita il link una sola volta, con «Copia»; quando l'invio delle email è attivo parte anche l'email. Creare un invito non fallisce più per l'email.
- **Inviti scaduti e «Nuovo link» (W2)**: gli scaduti restano nell'elenco con l'etichetta «Scaduto»; «Nuovo link» crea un link nuovo valido altri 7 giorni e quello vecchio smette di valere.
- **Pagina di accettazione** con parole che non presuppongono l'email.

Le regole di accettazione non cambiano: stessa email dell'invito, verificata, entro la scadenza (T-1503).

## Task atomici

```yaml
- id: T-3201
  title: "Link d'invito da copiare, email quando c'è"
  macrotask: "ux-invites"
  depends_on: [T-3101, T-1503, T-1402, T-3001]

  objective: >
    Restituire a chi invita il link dell'invito, una sola volta, e mandare l'email solo quando l'invio è disponibile,
    senza che un invio mancato o non riuscito annulli l'invito.

  definition_of_done:
    - "lib/workspaces/invites.ts: createInvite restituisce inviteUrl (APP_PUBLIC_URL/invites/accept?token=…, costruito come il link del template workspace-invite) ed emailSent; l'email workspace-invite parte solo se isEmailDeliveryAvailable() (T-3001) e un invio non riuscito lascia l'invito pendente con emailSent false (fine del 503 EMAIL_UNAVAILABLE); nel DB solo token_hash; il token non compare nei log (CWE-532)."
    - "POST /api/workspaces/[workspaceId]/invites: risposta 201 con { id, email, role, expiresAt, inviteUrl, emailSent } e header Cache-Control no-store; inviteUrl compare solo in questa risposta, mai nelle letture dell'elenco."
    - "Sezione Membri: «Invita una persona» (members.manage) apre una finestra (ModalDialog) con email e ruolo; dopo il 201 la finestra mostra il link in un campo di sola lettura con «Copia» (navigator.clipboard.writeText), la frase «lo vedi solo adesso», la scadenza e, se emailSent, «Gli abbiamo mandato anche un'email»; InviteForm sempre aperto lascia la pagina."
    - "Pagina /invites/accept: il link incompleto chiede di riaprire «il link che hai ricevuto» (non più «dalla email»); con INVITE_EMAIL_MISMATCH spiega di uscire ed entrare con l'account dell'indirizzo invitato."
    - "Emendamento dichiarato: AC-1503-1 (modulo 15) — la prima risposta è 201 con inviteUrl il cui token ha sha256 uguale a token_hash ed emailSent true; senza invio delle email la risposta è 201 con emailSent false e l'invito resta pendente."

  acceptance_criteria:
    - id: AC-3201-1
      given: "un ADMIN del workspace W, EMAIL_TRANSPORT outbox e il logger catturato"
      when: "invia POST /api/workspaces/{W}/invites con { email: 'nuovo@example.com', role: 'MEMBER' }"
      then: "la risposta è 201 con header Cache-Control no-store, emailSent true e inviteUrl che contiene '/invites/accept?token='; lo sha256 del token è il token_hash dell'unica riga di workspace_invites per nuovo@example.com; l'outbox ha 1 email con lo stesso link; nessuna riga del logger contiene il token"
    - id: AC-3201-2
      given: "EMAIL_TRANSPORT resend senza RESEND_API_KEY ed EMAIL_FROM"
      when: "lo stesso ADMIN invita altro@example.com"
      then: "la risposta è 201 con emailSent false e inviteUrl valorizzato; workspace_invites ha 1 riga pendente per altro@example.com e l'outbox 0 email verso quell'indirizzo"
    - id: AC-3201-3
      given: "un MEMBER di W"
      when: "invia la stessa POST"
      then: "la risposta è 403 e workspace_invites non ha righe nuove"
    - id: AC-3201-4
      given: "la finestra «Invita una persona» con fetch simulato che risponde 201 con inviteUrl 'https://app.test/invites/accept?token=abc' ed emailSent false e navigator.clipboard simulato"
      when: "si invia l'invito e si clicca «Copia»"
      then: "il campo di sola lettura contiene l'inviteUrl, writeText è chiamato 1 volta con l'inviteUrl e il testo «Gli abbiamo mandato anche un'email» non c'è"

  target_tests:
    - file: "tests/integration/invite-link.test.ts"
      covers: [AC-3201-1, AC-3201-2, AC-3201-3]
    - file: "tests/component/invite-dialog.test.tsx"
      covers: [AC-3201-4]

  security_notes:
    - "A07 / CWE-640: il token resta di 32 byte (CWE-330), monouso, con scadenza a 7 giorni e salvato solo come hash (CWE-312). Cambio dichiarato (D-41): il link si mostra una volta a chi ha members.manage, nella sola risposta della creazione con no-store; mai in elenchi, log o altre risposte (CWE-532)."
    - "A01 / CWE-285: l'accettazione resta legata all'email invitata e verificata (T-1503): chi riceve un link inoltrato senza avere quell'account non entra."

  out_of_scope:
    - "Inviti senza email (link aperti a chiunque) e registrazione dal link: la registrazione resta quella di T-1606 e D-32."

- id: T-3202
  title: "Inviti scaduti e «Nuovo link»"
  macrotask: "ux-invites"
  depends_on: [T-3201]

  objective: >
    Tenere in vista gli inviti scaduti e dare a ogni invito aperto un nuovo link, con una nuova scadenza, che rende
    inutile quello vecchio.

  definition_of_done:
    - "lib/workspaces/invites.ts: listOpenInvites (al posto di listPendingInvites) restituisce gli inviti con accepted_at e revoked_at nulli, compresi gli scaduti, con il campo expired; la revoca vale anche per gli scaduti."
    - "POST /api/workspaces/[workspaceId]/invites/[inviteId]/renew: members.manage (403 altrimenti); invito del workspace, non accettato e non revocato (410 INVITE_INVALID altrimenti); nuovo token da 32 byte salvato solo come hash ed expires_at = adesso più 7 giorni; email come T-3201; risposta 200 con inviteUrl ed emailSent e Cache-Control no-store; limite di frequenza per workspace con consumeRateLimit, condiviso con la creazione."
    - "Sezione Membri: ogni invito aperto mostra email, ruolo e scadenza, l'etichetta «Scaduto» se scaduto, «Nuovo link» (stessa finestra del link di T-3201) e «Revoca»."

  acceptance_criteria:
    - id: AC-3202-1
      given: "un invito I di W per x@example.com con expires_at nel passato e il suo vecchio token"
      when: "un ADMIN di W invia POST /api/workspaces/{W}/invites/{I}/renew"
      then: "la risposta è 200 con un inviteUrl nuovo; token_hash di I è cambiato ed expires_at è tra 7 giorni; l'utente x@example.com verificato che accetta con il vecchio token riceve 410 INVITE_INVALID e con il nuovo 200"
    - id: AC-3202-2
      given: "un invito accettato, uno revocato e un MEMBER di W"
      when: "l'ADMIN chiede il rinnovo dei primi due e il MEMBER quello di un invito aperto"
      then: "le risposte sono 410 INVITE_INVALID, 410 INVITE_INVALID e 403; token_hash ed expires_at delle tre righe sono invariati"
    - id: AC-3202-3
      given: "W con un invito in attesa e uno scaduto e un ADMIN autenticato"
      when: "apre /workspace/members"
      then: "la sezione inviti ha 2 righe, una sola con l'etichetta «Scaduto», e ciascuna ha i pulsanti «Nuovo link» e «Revoca»"

  target_tests:
    - file: "tests/integration/invite-link.test.ts"
      covers: [AC-3202-1, AC-3202-2]
    - file: "tests/e2e/workspace-sections.spec.ts"
      covers: [AC-3202-3]

  security_notes:
    - "A07 / CWE-613: il rinnovo sostituisce l'hash, quindi il vecchio link smette di valere; nessun ripristino di inviti accettati o revocati. Limite di frequenza contro l'invio massivo (CWE-799)."

  out_of_scope:
    - "Pulizia automatica degli inviti scaduti da tempo."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo nato dal brainstorming del 2026-10-14 (D-41): scelta «Link sempre + email» per gli inviti; W2 con «Nuovo link» per inviti in attesa e scaduti.
- Cambio di sicurezza dichiarato e approvato (D-41): il token dell'invito compare una volta nella risposta della creazione o del rinnovo, solo a chi gestisce i membri.
- Gate umani: nessuno.
- Scelte dell'agente da confermare (rilievi): un solo pulsante «Nuovo link» anche per gli inviti ancora validi; gli scaduti restano in elenco finché qualcuno non li revoca; limite di frequenza condiviso fra creazione e rinnovo.
- Note di costruzione (2026-10-15), scelte dell'agente da confermare dall'utente. T-3201: `inviteLink` nel template workspace-invite costruisce il link per l'email e per la risposta; `createInvite` e `renewInvite` restituiscono id, email, role, expiresAt, inviteUrl ed emailSent; l'email parte solo con `isEmailDeliveryAvailable()` e un invio non riuscito dà emailSent false senza toccare l'invito; nei log solo l'id dell'invito. La finestra «Invita una persona» (`components/invite-dialog.tsx`) si apre dal pulsante accanto al titolo della sezione inviti, ha la frase introduttiva di prima (7 giorni, stesso indirizzo verificato), il pulsante «Crea l'invito» e, dopo il 201, al posto del modulo il campo «Link dell'invito per …» già selezionato, «Copia» con «Link copiato.», «Lo vedi solo adesso: copialo e mandalo alla persona che inviti. Il link vale fino al …», la frase dell'email solo con emailSent e «Fatto»; la pagina si aggiorna subito con il nuovo invito. Accettazione: «riapri il link che hai ricevuto», intro con «l'account dell'indirizzo invitato» e INVITE_EMAIL_MISMATCH «esci ed entra con l'account dell'indirizzo invitato». T-3202: limite fisso di 20 inviti l'ora per workspace, condiviso fra creazione e rinnovo (`workspaceInvite` in rate-limit-config, consumato con `consumeRateLimit`); il rinnovo rifiuta con gli stessi 409 della creazione un invito il cui indirizzo è già di un membro o ha un altro invito pendente, e conta un posto del piano solo quando l'invito era scaduto (T-1605); la sezione si chiama «Inviti» («Nessun invito aperto.»), lo scaduto mostra l'etichetta «Scaduto» con la data, «Nuovo link» apre la finestra «Nuovo link per …» con la stessa vista del link. Rimossi senza uso: InviteForm e il testo `workspace.invites.sent`.
