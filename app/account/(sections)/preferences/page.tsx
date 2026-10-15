import { getTranslations } from "next-intl/server";
import { AuthSettingsCard } from "@/components/auth-settings-card";
import { GoogleSheetsPersonalCard } from "@/components/google-sheets-personal-card";
import { PageIntro } from "@/components/page-intro";
import { PersonalizationSettingsCard } from "@/components/personalization-settings-card";
import { SettingsLinkCard } from "@/components/settings-link-card";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";

export const dynamic = "force-dynamic";

export default async function PersonalizzaPage() {
  const user = await requirePageUser();
  const [googleSheets, t, tWorkspace, tAccount] = await Promise.all([
    getGoogleSheetsCredentialSnapshot(user.id),
    getTranslations("settings"),
    getTranslations("workspace.settingsLink"),
    getTranslations("account.settingsLink"),
  ]);

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />

      <PersonalizationSettingsCard
        initial={{
          themeMode: user.themeMode,
          fontScaleMode: user.fontScaleMode,
          colorVisionMode: user.colorVisionMode,
        }}
      />

      <GoogleSheetsPersonalCard
        initial={{
          connected: googleSheets.connected,
          status: googleSheets.status,
          needsReconnect: googleSheets.needsReconnect,
          connectedEmail: googleSheets.connectedEmail,
          scope: googleSheets.scope,
          tokenType: googleSheets.tokenType,
          updatedAt: googleSheets.updatedAt?.toISOString(),
        }}
      />

      {/* Accesso alla pagina del workspace attivo (T-1504): nome, membri, ruoli e inviti. */}
      <SettingsLinkCard title={tWorkspace("title")} intro={tWorkspace("intro")} href="/workspace" label={tWorkspace("open")} />

      <AuthSettingsCard
        initial={{
          email: user.email,
          displayName: user.displayName,
        }}
      />

      {/* Export e cancellazione dell'account (T-1804). */}
      <SettingsLinkCard title={tAccount("title")} intro={tAccount("intro")} href="/account" label={tAccount("open")} />
    </div>
  );
}