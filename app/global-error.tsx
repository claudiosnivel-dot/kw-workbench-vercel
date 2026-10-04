"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Sostituisce il layout radice quando l'errore nasce lì: html e body propri, senza gli stili globali.
// Mostra solo il digest dell'errore, mai message o stack (CWE-209). L'eccezione va a Sentry (T-601),
// che senza DSN non è inizializzato e la ignora.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="it">
      <body>
        <main>
          <h1>Si è verificato un errore</h1>
          <p>Non è stato possibile caricare l&apos;applicazione. Riprova tra qualche istante.</p>
          {error.digest && <p>Codice errore: {error.digest}</p>}
          <button type="button" onClick={() => retry()}>
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
