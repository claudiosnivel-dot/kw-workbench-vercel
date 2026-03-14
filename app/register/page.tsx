import Link from "next/link";
import { RegisterForm } from "@/components/register-form";
import { isPublicSignupEnabled } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextValue = params.next;
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;
  const signupEnabled = isPublicSignupEnabled();

  return (
    <div className="mx-auto max-w-lg">
      <div className="card space-y-4">
        <h1 className="text-2xl font-semibold">Crea account</h1>
        {signupEnabled ? (
          <>
            <p className="text-sm text-slate-600">Compila i campi per attivare il tuo workspace.</p>
            <RegisterForm nextPath={nextPath && nextPath.startsWith("/") ? nextPath : "/"} />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">La registrazione pubblica e disabilitata in questo momento.</p>
            <Link href="/login" className="btn-secondary w-full text-center sm:w-auto">
              Vai al login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
