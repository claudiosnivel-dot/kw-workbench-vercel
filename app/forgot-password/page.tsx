import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NarrowCard } from "@/components/narrow-card";

export const dynamic = "force-dynamic";

/** Pagina pubblica del recupero password (T-1404), con Referrer-Policy no-referrer da next.config.ts. */
export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");

  return (
    <NarrowCard title={t("title")} action={<LocaleSwitcher />}>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      <ForgotPasswordForm />
    </NarrowCard>
  );
}
