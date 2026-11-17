# 71-mcp-keys — Macrotask `mcp-keys`

> La chiave con cui Claude Code si collega a Titan SEO al posto del root admin, con la durata scelta dall'utente e la
> card per crearla e revocarla (D-64).

## Obiettivo del macrotask
Richiesta dell'utente del 2026-11-17: «vorrei che un agente tipo Claude Code possa lavorare su Titan SEO al posto
dell'utente», per ora solo per il root admin. Disegno approvato in
`docs/superpowers/specs/2026-11-17-claude-code-mcp-design.md`. Questo modulo fa la chiave personale (anti-obiettivo 3
del disegno: una chiave rubata non deve aprire tutto) e la card dell'amministrazione; il server MCP che la usa arriva
con il modulo 72.

## Task atomici

```yaml
- id: T-7101
  title: "Chiave di Claude Code del root admin"
  macrotask: "mcp-keys"
  depends_on: [T-3301, T-1704]

  objective: >
    Dare al root admin una chiave personale per Claude Code, con la durata che sceglie, che Titan SEO non conserva in
    chiaro, che si revoca subito e che vale solo finché l'account resta root admin.

  definition_of_done:
    - "Migrazione additiva: tabella agent_keys (id, user_id con cascata, prefix, hash sha-256 unico, created_at, expires_at null per «Mai», last_used_at, revoked_at)."
    - "lib/modules/agent/keys.ts: createAgentKey(user, duration) con duration 30, 60, 90 o never; la chiave è «tsk_» più 32 byte casuali in base64url, si restituisce una volta sola e si salvano solo hash e prefisso (primi 8 caratteri dopo «tsk_»); una chiave nuova revoca nella stessa transazione quella attiva dell'utente."
    - "verifyAgentKey(token): null se la chiave non esiste, è revocata o scaduta, o se l'utente non è ACTIVE, ADMIN e root admin o ha il cambio password in sospeso; altrimenti l'utente e l'id della chiave. Il confronto avviene sull'hash (CWE-208: nessun confronto del testo in chiaro)."
    - "revokeAgentKey(user) e agentKeyStatus(user) (prefisso, creazione, scadenza o null, ultimo uso, revocata o attiva)."
    - "Rotte /api/admin/agent-key solo per il root admin (requireRootAdminUserFromRequest): GET stato, POST crea con { duration }, DELETE revoca; Cache-Control no-store; creazione e revoca nel registro delle azioni amministrative (T-1704) senza la chiave."

  acceptance_criteria:
    - id: AC-7101-1
      given: "il root admin senza chiavi"
      when: "invia POST /api/admin/agent-key con duration 30"
      then: "la risposta 201 contiene la chiave che inizia con «tsk_» e la scadenza a 30 giorni; nella tabella agent_keys c'è una riga con l'hash e il prefisso e nessuna colonna contiene la chiave"
    - id: AC-7101-2
      given: "il root admin con una chiave attiva A"
      when: "crea una seconda chiave B con duration never"
      then: "verifyAgentKey(A) è null, verifyAgentKey(B) dà il root admin e B ha expires_at null"
    - id: AC-7101-3
      given: "una chiave valida del root admin"
      when: "la chiave scade, oppure viene revocata, oppure l'utente perde il ruolo di root admin"
      then: "verifyAgentKey dà null in ciascuno dei tre casi"
    - id: AC-7101-4
      given: "un ADMIN che non è root admin e un utente normale"
      when: "chiamano GET, POST e DELETE di /api/admin/agent-key"
      then: "ogni risposta è 403 e la tabella agent_keys resta vuota"

  target_tests:
    - file: "tests/integration/agent-keys.test.ts"
      covers: [AC-7101-1, AC-7101-2, AC-7101-3, AC-7101-4]

  security_notes:
    - "A07 / CWE-798, CWE-256: la chiave non si salva in chiaro, solo l'hash sha-256; si mostra una volta."
    - "A01 / CWE-285: rotte e verifica solo per il root admin attivo; la verifica rilegge ruolo e stato a ogni chiamata."
    - "A09 / CWE-778: creazione e revoca nel registro delle azioni amministrative, mai la chiave."

  out_of_scope:
    - "Più chiavi attive, chiavi per altri utenti o per workspace."
    - "Il server MCP che usa la chiave (modulo 72)."

- id: T-7102
  title: "Card «Claude Code» nelle impostazioni dell'amministrazione"
  macrotask: "mcp-keys"
  depends_on: [T-7101, T-3501]

  objective: >
    Far creare, copiare e revocare la chiave dalla card, con il comando pronto per collegare Claude Code.

  definition_of_done:
    - "components/admin-agent-key-card.tsx in /admin/settings dopo la card dei titoli con l'AI: stato della chiave (prefisso, creata il, scade il o «Mai», ultimo uso o «Mai usata»), scelta della durata (30 giorni, 60 giorni, 90 giorni, Mai; 90 preselezionato) e «Crea la chiave» (con una chiave attiva: «Crea una chiave nuova», con il dialogo che avvisa che la vecchia smette di funzionare)."
    - "Dopo la creazione la card mostra una volta la chiave e il comando `claude mcp add --transport http titanseo <origine dell'app>/api/mcp --header \"Authorization: Bearer <chiave>\"` con «Copia» per ciascuno e l'avviso che non si vedranno più; ricaricando la pagina resta solo il prefisso."
    - "«Revoca» con il dialogo di conferma; dopo la risposta la card mostra «Nessuna chiave attiva»."
    - "Testi in it, en, es-ES (es-419 solo se diverso); a 390 px niente scorrimento orizzontale (il comando va a capo) e pulsanti alti almeno 44 px; un solo pulsante primario per schermata (AC-2605-1)."

  acceptance_criteria:
    - id: AC-7102-1
      given: "la card senza chiave attiva"
      when: "si sceglie «60 giorni» e si preme «Crea la chiave»"
      then: "parte POST /api/admin/agent-key con duration 60; la card mostra la chiave e il comando claude mcp add che la contiene, ciascuno con «Copia»"
    - id: AC-7102-2
      given: "la card con una chiave attiva creata il 2026-11-17 che scade il 2026-12-17"
      when: "si apre la card"
      then: "la card mostra il prefisso, la data di scadenza e «Mai usata», non mostra la chiave, e «Crea una chiave nuova» apre il dialogo dell'avviso"
    - id: AC-7102-3
      given: "la card con una chiave attiva"
      when: "si preme «Revoca» e si conferma"
      then: "parte DELETE /api/admin/agent-key e la card mostra «Nessuna chiave attiva»"

  target_tests:
    - file: "tests/component/admin-agent-key-card.test.tsx"
      covers: [AC-7102-1, AC-7102-2, AC-7102-3]

  security_notes:
    - "A07 / CWE-312: la chiave sta solo nello stato del componente dopo la risposta, mai in un URL o nello storage del browser."
    - "La card è nella pagina riservata al root admin (requireRootAdminPageUser)."

  out_of_scope:
    - "Registro delle chiamate e spesa di Claude Code nella card (moduli 73 e 76)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dal disegno approvato dall'utente il 2026-11-17 («approvo», D-64): durata a scelta 30, 60, 90 giorni o Mai (scelta dell'utente), una sola chiave attiva, solo hash, revoca, ultimo uso.
- Scelte dell'agente (le principali confermate dall'utente il 2026-11-17, D-65; le altre restano dell'agente): formato «tsk_» + 32 byte, prefisso di 8 caratteri, 90 giorni preselezionati, card dopo quella dei titoli con l'AI.
- Ordine: primo dei moduli 71-76; T-7102 dopo T-7101.
- Note di costruzione (2026-11-17, scelte dell'agente da confermare). T-7101: tabella `agent_keys` (migrazione additiva `0059_agent_keys`) con l'hash nella colonna `key_hash` CHAR(64) unica e l'indice unico parziale `agent_keys_single_active_idx` (una sola chiave non revocata per utente: con due creazioni insieme una riceve 409 CONFLICT e resta una sola chiave attiva); la chiave è «tsk_» più 43 caratteri base64url; una chiave nuova revoca anche la precedente già scaduta; `verifyAgentKey` scarta senza calcolare l'hash i valori senza «tsk_» o più lunghi di 64 caratteri; `isRootAdminUser` ora esportato da `lib/auth/current-user.ts`; nel registro `agent_key.create` (prefisso, durata, scadenza, numero di chiavi revocate) e `agent_key.revoke` (prefisso), con `target_type` `agent_key` e l'id della chiave; GET dà lo stato dell'ultima chiave (null se non ce n'è mai stata una) con `active`; DELETE senza chiave attiva risponde 200 e non scrive nel registro; una durata diversa da 30, 60, 90 o "never" è 400 VALIDATION_ERROR; durate e tipi in `lib/modules/agent/key-types.ts`, che usa anche la card. T-7102: card in `components/admin-agent-key-card.tsx` e dialogo in `components/admin-agent-key-dialog.tsx` (in un file a parte perché le importazioni in testa uguali a quelle di `email-change-section.tsx` erano un blocco doppio per jscpd); origine del comando da `APP_PUBLIC_URL`, altrimenti quella della pagina; chiave e comando in campi di sola lettura (il comando in un riquadro di 4 righe che va a capo), ciascuno con «Copia» e il nome accessibile «Copia la chiave» o «Copia il comando»; senza chiave attiva «Crea la chiave» è il pulsante primario, con una chiave attiva «Crea una chiave nuova» e «Revoca» sono secondari e il rosso compare solo nel dialogo della revoca; una chiave scaduta conta come «Nessuna chiave attiva»; la card tiene lo stato nel componente, senza ricaricare la pagina. AC-7101-1…4 e AC-7102-1…3 rossi senza le modifiche (moduli e componente assenti). In più: due creazioni contemporanee, chiavi sconosciute o di un utente sospeso o con il cambio password in sospeso, durate non valide, «Copiato» e l'errore della revoca nel dialogo; E2E non target `tests/e2e/agent-key.spec.ts` per il DoD a 390 px (le chiavi del root admin seed si tolgono prima e dopo).
