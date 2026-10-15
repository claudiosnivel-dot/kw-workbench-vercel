import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth/credentials";
import { isAdminUser } from "@/lib/auth/current-user";
import { requirePageUser } from "@/lib/auth/page-guard";

/** Sezione dell'amministrazione aperta a ogni admin (T-3301): gli altri utenti vanno alla home. */
export async function requireAdminPageUser(): Promise<AuthUser> {
  const user = await requirePageUser();
  if (!isAdminUser(user)) {
    redirect("/");
  }
  return user;
}

/**
 * Sezione dell'amministrazione del solo root admin (T-3301: Panoramica, Impostazioni e Registro): l'admin non root va a
 * Utenti. La verifica è della pagina, non della navigazione, che nasconde le voci solo per comodità (CWE-285).
 */
export async function requireRootAdminPageUser(): Promise<AuthUser> {
  const user = await requireAdminPageUser();
  if (!user.isRootAdmin) {
    redirect("/admin/users");
  }
  return user;
}
