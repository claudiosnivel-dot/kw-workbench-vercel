import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PasswordCard } from "@/components/account-security-cards";
import { PageIntro } from "@/components/page-intro";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/**
 * Cambio password obbligato dopo un reset da admin (T-1704): l'unica pagina aperta finché il flag resta attivo, con il
 * modulo Password della sezione Accesso (T-2802; PATCH /api/auth/config azzera il flag) e senza la navigazione delle
 * sezioni dell'account. Senza il flag torna alla dashboard.
 */
export default async function AccountPasswordPage() {
  const user = await requirePageUser({ allowPendingPasswordChange: true });
  if (!user.mustChangePassword) {
    redirect("/");
  }
  const t = await getTranslations("settings.passwordChange");

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />
      <PasswordCard />
    </div>
  );
}
