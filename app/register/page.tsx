import { RegisterForm } from "@/components/register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextValue = params.next;
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <section className="card hidden flex-col justify-between lg:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Nuovo account</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">Crea il tuo spazio di lavoro personale</h1>
            <p className="mt-3 text-sm text-slate-600">
              Ogni account mantiene progetti, risultati ed esportazioni completamente separati dagli altri utenti.
            </p>
          </div>
          <div className="mt-8 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 text-sm text-slate-600">
            Accesso immediato dopo registrazione, gestione credenziali autonoma e configurazioni integrazioni dedicate.
          </div>
        </section>

        <div className="card space-y-4">
          <h2 className="text-2xl font-semibold">Crea account</h2>
          <p className="text-sm text-slate-600">Compila i campi per attivare il tuo workspace.</p>
          <RegisterForm nextPath={nextPath && nextPath.startsWith("/") ? nextPath : "/"} />
        </div>
      </div>
    </div>
  );
}