# Google Sheets: OAuth e scope

L'export su Google Sheets usa il consenso OAuth di ogni utente (pagina Personalizza). Dal macrotask 09
(T-907) l'app chiede lo scope **`https://www.googleapis.com/auth/drive.file`** al posto di
`https://www.googleapis.com/auth/spreadsheets`:

- `drive.file` è *Recommended, Non-sensitive* e dà accesso solo ai file che l'app crea o che l'utente apre con
  essa; `spreadsheets` è *Sensitive* e dà accesso a tutti i fogli dell'utente
  (https://developers.google.com/workspace/sheets/api/scopes);
- con scope sensibili un'app non verificata mostra la schermata «unverified app» ed è limitata a 100 nuovi
  utenti (https://support.google.com/cloud/answer/7454865);
- l'export crea un file nuovo e scrive solo su quello (eventuale pulizia del file incompleto compresa, T-806),
  quindi `drive.file` basta.

## Azione dell'utente: schermata di consenso nel progetto Google Cloud

1. Google Cloud Console > progetto del client OAuth di Google Sheets > «Google Auth Platform» (o «Schermata
   consenso OAuth») > **Accesso ai dati** (Data access).
2. Rimuovere lo scope `.../auth/spreadsheets`.
3. Aggiungere lo scope `.../auth/drive.file` (oltre a `openid` ed `email`).
4. Salvare. Se l'app era in verifica per lo scope sensibile, la verifica non serve più per Sheets.

## Connessioni esistenti

Le credenziali salvate con lo scope precedente restano collegate ma la card di Personalizza invita a
ricollegarsi (`needsReconnect`): al nuovo consenso Google concede `drive.file` e la credenziale si aggiorna.

## Errori del collegamento (T-906)

Connect e callback tornano a `/personalizza?google_sheets=error&reason=<codice>` con un codice tra
`accesso_negato`, `stato_non_valido`, `config_oauth_mancante`, `scope_mancante`, `scambio_token_fallito`,
`sessione_scaduta`; la card mostra il testo italiano del codice. Un refresh token revocato o scaduto
(`invalid_grant`) segna la credenziale «Da ricollegare» e l'export risponde 409 `GOOGLE_REAUTH_REQUIRED`. La
disconnessione revoca il token presso Google (`POST https://oauth2.googleapis.com/revoke`) e cancella la
credenziale anche se la revoca non riesce.

## Da verificare con un account Google reale

La prova end-to-end dell'export con `drive.file` (creazione del file, scrittura a blocchi, pulizia del file
incompleto) richiede un account Google reale ed è a carico dell'utente; l'esito va registrato in
`docs/blueprint/SESSION-STATE.md`. I test automatici simulano le API Google.
