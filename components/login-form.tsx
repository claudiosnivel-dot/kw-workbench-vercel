"use client";

import { CredentialsForm } from "@/components/credentials-form";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/** Accesso (T-303, T-1303): dopo il login si torna solo a un percorso della stessa origine. */
export function LoginForm({ nextPath }: { nextPath: string }) {
  return <CredentialsForm mode="login" redirectPath={safeNextPath(nextPath)} />;
}
