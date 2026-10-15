import { AdminLaunchCard } from "@/components/admin-launch-card";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { GoogleSheetsApiConfigCard } from "@/components/google-sheets-api-config-card";
import { requireRootAdminPageUser } from "@/lib/admin/page-access";
import { getLaunchChecklist, getLaunchState } from "@/lib/billing/launch";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleSheetsApiConfigSnapshot } from "@/lib/integrations/google-sheets-config";

export const dynamic = "force-dynamic";

/** Impostazioni dell'amministrazione (T-3301), del solo root admin: branding, API di Google Sheets e lancio commerciale. */
export default async function AdminSettingsPage() {
  await requireRootAdminPageUser();
  const [branding, googleSheetsConfig, launch] = await Promise.all([
    getBrandingSnapshot(),
    getGoogleSheetsApiConfigSnapshot(),
    getLaunchState(),
  ]);

  return (
    <>
      <BrandingSettingsCard
        initial={{
          appName: branding.appName,
          logoUrl: branding.logoUrl,
          logoUrlDark: branding.logoUrlDark,
          logoUrlLight: branding.logoUrlLight,
        }}
      />
      <GoogleSheetsApiConfigCard initial={googleSheetsConfig} />
      <AdminLaunchCard launch={{ ...launch, checklist: getLaunchChecklist() }} />
    </>
  );
}
