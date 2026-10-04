import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/auth/safe-next-path";

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
  const nextPath = safeNextPath(Array.isArray(nextValue) ? nextValue[0] : nextValue);

  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Accesso</h1>
        <p className="text-sm text-slate-600">Autenticati per accedere al tuo workspace.</p>
        <LoginNotice reason={params.reason} />
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}

// Codici ammessi in ?reason=: il testo arriva solo da qui, il valore dell'URL non viene mai mostrato (T-502).
const LOGIN_NOTICES: Record<string, string> = {
  session_ended: "La sessione è terminata. Accedi di nuovo.",
};

function LoginNotice({ reason }: { reason: string | string[] | undefined }) {
  const code = Array.isArray(reason) ? reason[0] : reason;
  const message = code && Object.hasOwn(LOGIN_NOTICES, code) ? LOGIN_NOTICES[code] : null;
  if (!message) {
    return null;
  }

  return (
    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {message}
    </p>
  );
}
