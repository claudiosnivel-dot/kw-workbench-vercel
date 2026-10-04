import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Solo un utente esistente e ACTIVE (letto dal DB) torna alla dashboard: non basta la firma del token.
  if (await getOptionalAuthenticatedUserFromCookies()) {
    redirect("/");
  }

  const params = await searchParams;
  const nextValue = params.next;
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Accesso</h1>
        <p className="text-sm text-slate-600">Autenticati per accedere al tuo workspace.</p>
        <LoginForm nextPath={nextPath && nextPath.startsWith("/") ? nextPath : "/"} />
      </div>
    </div>
  );
}
