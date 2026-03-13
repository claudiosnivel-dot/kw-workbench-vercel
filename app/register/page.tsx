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
    <div className="mx-auto max-w-md">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Crea account</h1>
        <p className="text-sm text-slate-600">Ogni account ha un workspace separato con progetti e risultati isolati.</p>
        <RegisterForm nextPath={nextPath && nextPath.startsWith("/") ? nextPath : "/"} />
      </div>
    </div>
  );
}
