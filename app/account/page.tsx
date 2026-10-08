import { getTranslations } from "next-intl/server";
import { AccountDataCard } from "@/components/account-data-card";
import { PageIntro } from "@/components/page-intro";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/** Dati dell'account (T-1804, GDPR): download dell'export JSON e cancellazione con conferma della password. */
export default async function AccountPage() {
  await requirePageUser();
  const t = await getTranslations("account");

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />
      <AccountDataCard />
    </div>
  );
}
