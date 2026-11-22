import { AdminAgentKeyCard } from "@/components/admin-agent-key-card";
import { AiTitlesSettingsCard } from "@/components/admin-ai-titles-card";
import { AdminLaunchCard } from "@/components/admin-launch-card";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { GoogleSheetsApiConfigCard } from "@/components/google-sheets-api-config-card";
import { requireRootAdminPageUser } from "@/lib/admin/page-access";
import { getAiTitlesView } from "@/lib/ai/settings";
import { getLaunchChecklist, getLaunchState } from "@/lib/billing/launch";
import { getPublicAppUrl } from "@/lib/env";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleSheetsApiConfigSnapshot } from "@/lib/integrations/google-sheets-config";
import { readAgentActivity } from "@/lib/modules/agent/activity";
import { agentKeyStatus } from "@/lib/modules/agent/keys";

export const dynamic = "force-dynamic";

/**
 * Impostazioni dell'amministrazione (T-3301), del solo root admin: branding, API di Google Sheets, lancio commerciale e
 * titoli con l'AI (T-3501), chiave, tetto di spesa e attività di Claude Code (T-7102, T-7302, T-7602).
 */
export default async function AdminSettingsPage() {
  const user = await requireRootAdminPageUser();
  const [branding, googleSheetsConfig, launch, aiTitles, agentKey, agentActivity] = await Promise.all([
    getBrandingSnapshot(),
    getGoogleSheetsApiConfigSnapshot(),
    getLaunchState(),
    getAiTitlesView(),
    agentKeyStatus(user),
    readAgentActivity(user),
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
      <AiTitlesSettingsCard initial={aiTitles} />
      <AdminAgentKeyCard initial={agentKey} origin={getPublicAppUrl()} spend={agentActivity.spend} calls={agentActivity.calls} />
    </>
  );
}
