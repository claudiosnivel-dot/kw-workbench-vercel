"use client";

import { CredentialsForm } from "@/components/credentials-form";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/**
 * Registrazione pubblica (T-303, T-1303): termsVersion arriva dal Server Component della pagina ed è la versione dei
 * termini che l'utente accetta con la casella obbligatoria (T-1405); turnstileSiteKey accende il CAPTCHA (T-1702).
 */
export function RegisterForm({
  nextPath,
  termsVersion,
  turnstileSiteKey,
}: {
  nextPath: string;
  termsVersion: string;
  turnstileSiteKey: string | null;
}) {
  const redirectPath = safeNextPath(nextPath);
  return (
    <CredentialsForm
      mode="register"
      redirectPath={redirectPath}
      termsVersion={termsVersion}
      turnstileSiteKey={turnstileSiteKey}
    />
  );
}
