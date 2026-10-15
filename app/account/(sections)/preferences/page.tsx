import { PersonalizationSettingsCard } from "@/components/personalization-settings-card";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/** Sezione Preferenze dell'account (T-2801): tema, leggibilità e modalità daltonismo, come prima in Personalizza. */
export default async function AccountPreferencesPage() {
  const user = await requirePageUser();

  return (
    <PersonalizationSettingsCard
      initial={{
        themeMode: user.themeMode,
        fontScaleMode: user.fontScaleMode,
        colorVisionMode: user.colorVisionMode,
      }}
    />
  );
}
