import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthSettingsCard } from "@/components/auth-settings-card";
import { PageIntro } from "@/components/page-intro";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/**
 * Cambio password obbligato dopo un reset da admin (T-1704): l'unica pagina aperta finché il flag resta attivo, con la
 * card dell'account di Personalizza (PATCH /api/auth/config azzera il flag). Senza il flag torna alla dashboard.
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
      <AuthSettingsCard initial={{ email: user.email, displayName: user.displayName }} />
    </div>
  );
}
