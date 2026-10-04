import { AuthSettingsCard } from "@/components/auth-settings-card";
import { GoogleSheetsPersonalCard } from "@/components/google-sheets-personal-card";
import { PersonalizationSettingsCard } from "@/components/personalization-settings-card";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";

export const dynamic = "force-dynamic";

export default async function PersonalizzaPage() {
  const user = await requirePageUser();
  const googleSheets = await getGoogleSheetsCredentialSnapshot(user.id);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Personalizza</h1>
        <p className="mt-2 text-sm text-slate-600">
          Gestisci preferenze visive, credenziali account e connessioni personali da un unico punto.
        </p>
      </section>

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
          connectedEmail: googleSheets.connectedEmail,
          scope: googleSheets.scope,
          tokenType: googleSheets.tokenType,
          updatedAt: googleSheets.updatedAt?.toISOString(),
        }}
      />

      <AuthSettingsCard
        initial={{
          username: user.username,
        }}
      />
    </div>
  );
}