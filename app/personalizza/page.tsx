import { AuthSettingsCard } from "@/components/auth-settings-card";
import { PersonalizationSettingsCard } from "@/components/personalization-settings-card";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function PersonalizzaPage() {
  const user = await requireAuthenticatedUserFromCookies();

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Personalizza</h1>
        <p className="mt-2 text-sm text-slate-600">
          Gestisci preferenze visive e credenziali del tuo account da un unico punto.
        </p>
      </section>

      <PersonalizationSettingsCard
        initial={{
          themeMode: user.themeMode,
          fontScaleMode: user.fontScaleMode,
          colorVisionMode: user.colorVisionMode,
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