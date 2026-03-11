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
    <div className="mx-auto max-w-md">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Accesso</h1>
        <p className="text-sm text-slate-600">Autenticati per accedere al tuo workspace Seo God Mode.</p>
        <LoginForm nextPath={nextPath && nextPath.startsWith("/") ? nextPath : "/"} />
      </div>
    </div>
  );
}