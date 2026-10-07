"use client";

import { CredentialsForm } from "@/components/credentials-form";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/** Registrazione pubblica (T-303, T-1303): il nuovo utente entra con la sessione e apre un percorso della stessa origine. */
export function RegisterForm({ nextPath }: { nextPath: string }) {
  const redirectPath = safeNextPath(nextPath);
  return <CredentialsForm mode="register" redirectPath={redirectPath} />;
}
