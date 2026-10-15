import { getTranslations } from "next-intl/server";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { LeaveWorkspaceButton, TransferOwnershipForm, WorkspaceNameForm } from "@/components/workspace-controls";
import { canPerform } from "@/lib/authz/permissions";
import { requireCurrentWorkspace } from "@/lib/workspaces/current";
import { listMembers } from "@/lib/workspaces/members";

export const dynamic = "force-dynamic";

/**
 * Sezione Generale del workspace (T-3101, T-1504): nome e «Azioni irreversibili» con il trasferimento della proprietà e
 * l'uscita. I controlli si rendono solo ai ruoli ammessi dalla tabella dei permessi (T-1502); la verifica resta nelle
 * rotte di T-1503.
 */
export default async function WorkspaceGeneralPage() {
  const { user, workspace } = await requireCurrentWorkspace();
  const [members, t] = await Promise.all([listMembers(workspace.id), getTranslations("workspace")]);
  const others = members.filter((member) => member.user.id !== user.id);
  const canTransfer = canPerform(workspace.role, "workspace.transfer") && others.length > 0;
  // Dal workspace personale si esce solo se un altro membro ne è OWNER (T-2007): poi l'utente ne riceve uno nuovo.
  const canLeave = !workspace.isPersonal || others.some((member) => member.role === "OWNER");

  return (
    <>
      <WorkspaceNameForm
        key={workspace.id}
        workspaceId={workspace.id}
        name={workspace.name}
        canEdit={canPerform(workspace.role, "workspace.update")}
      />

      {(canTransfer || canLeave) && (
        <DangerZoneCard title={t("danger.title")} warning={t("danger.warning")}>
          <div className="space-y-6">
            {canTransfer && (
              <TransferOwnershipForm
                workspaceId={workspace.id}
                members={others.map((member) => ({ id: member.user.id, name: member.user.display_name }))}
              />
            )}
            {canLeave && (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">{t("leave.title")}</h3>
                  <p className="text-sm text-slate-600">{t(workspace.isPersonal ? "leave.personalIntro" : "leave.intro")}</p>
                </div>
                <LeaveWorkspaceButton workspaceId={workspace.id} workspaceName={workspace.name} />
              </div>
            )}
          </div>
        </DangerZoneCard>
      )}
    </>
  );
}
