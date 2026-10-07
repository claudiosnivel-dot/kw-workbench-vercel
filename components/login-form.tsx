"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CredentialsForm } from "@/components/credentials-form";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/**
 * Accesso con email e password (T-303, T-1303, T-1401): dopo il login si torna solo a un percorso della stessa origine;
 * il link «Password dimenticata?» apre il recupero password (T-1404).
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations("auth.login");

  return (
    <div className="space-y-3">
      <CredentialsForm mode="login" redirectPath={safeNextPath(nextPath)} />
      <p className="text-sm text-slate-600">
        <Link href="/forgot-password" className="font-medium underline">
          {t("forgotPassword")}
        </Link>
      </p>
    </div>
  );
}
