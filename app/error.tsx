"use client";

// Mostra solo il digest dell'errore, mai message o stack (CWE-209): il digest ritrova l'errore nei log del server.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Si è verificato un errore</h1>
        <p className="text-sm text-slate-600">Non è stato possibile caricare la pagina. Riprova tra qualche istante.</p>
        {error.digest && <p className="text-xs text-slate-500">Codice errore: {error.digest}</p>}
        <button className="btn-primary" type="button" onClick={() => retry()}>
          Riprova
        </button>
      </div>
    </div>
  );
}
