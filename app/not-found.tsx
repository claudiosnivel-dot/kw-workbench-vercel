import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Pagina non trovata</h1>
        <p className="text-sm text-slate-600">La pagina richiesta non esiste o non è accessibile con il tuo account.</p>
        <Link href="/" className="btn-primary inline-block">
          Torna alla dashboard
        </Link>
      </div>
    </div>
  );
}
