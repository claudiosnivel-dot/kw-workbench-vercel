import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextValue = params.next;
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <section className="card hidden flex-col justify-between lg:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Welcome back</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">Rientra nel tuo workspace SEO multi-account</h1>
            <p className="mt-3 text-sm text-slate-600">
              Pipeline keyword, filtri avanzati e integrazioni pronti all'uso, con dati isolati per ogni account.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 text-sm text-slate-600">
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">Account separati</div>
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">Export CSV/XLSX/JSON</div>
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">Google Ads opzionale</div>
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">UI responsive</div>
          </div>
        </section>

        <div className="card space-y-4">
          <h2 className="text-2xl font-semibold">Accesso</h2>
          <p className="text-sm text-slate-600">Autenticati per accedere al tuo workspace.</p>
          <LoginForm nextPath={nextPath && nextPath.startsWith("/") ? nextPath : "/"} />
        </div>
      </div>
    </div>
  );
}