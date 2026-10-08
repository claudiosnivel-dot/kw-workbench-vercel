import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageIntro } from "@/components/page-intro";
import {
  InviteForm,
  LeaveWorkspaceButton,
  MemberRoleSelect,
  RemoveMemberButton,
  RevokeInviteButton,
  TransferOwnershipForm,
  WorkspaceNameForm,
} from "@/components/workspace-controls";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform, outranksOrEquals } from "@/lib/authz/permissions";
import { getPageWorkspace } from "@/lib/authz/workspace";
import { formatDate } from "@/lib/view/format";
import { listPendingInvites } from "@/lib/workspaces/invites";
import { listMembers } from "@/lib/workspaces/members";

export const dynamic = "force-dynamic";

/**
 * Impostazioni del workspace attivo (T-1504): nome, membri con ruolo e data di ingresso, inviti in attesa. I controlli
 * si rendono solo ai ruoli ammessi dalla tabella dei permessi (T-1502); la verifica resta nelle rotte di T-1503.
 */
export default async function WorkspacePage() {
  const user = await requirePageUser();
  const { workspace } = await getPageWorkspace(user.id);
  const [members, invites, t, format] = await Promise.all([
    listMembers(workspace.id),
    listPendingInvites(workspace.id),
    getTranslations("workspace"),
    getFormatter(),
  ]);
  const canManage = canPerform(workspace.role, "members.manage");
  const canTransfer = canPerform(workspace.role, "workspace.transfer");
  const others = members.filter((member) => member.user.id !== user.id);

  return (
    <div className="space-y-6">
      <PageIntro title={t("page.heading", { name: workspace.name })} intro={t("page.intro")} />

      <section className="card space-y-2 text-sm text-slate-600">
        <p>{t("page.yourRole", { role: t(`roles.${workspace.role}`) })}</p>
        {workspace.isPersonal && <p>{t("page.personal")}</p>}
        <p>{t("page.sheetsNote")}</p>
        {/* Piano e fatturazione del workspace (T-1604): la pagina mostra a tutti i membri piano e rinnovo. */}
        <Link href="/billing" className="btn-secondary inline-block">
          {t("page.billingLink")}
        </Link>
      </section>

      <WorkspaceNameForm
        key={workspace.id}
        workspaceId={workspace.id}
        name={workspace.name}
        canEdit={canPerform(workspace.role, "workspace.update")}
      />

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("members.title")}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("members.name")}</th>
                <th className="px-3 py-2">{t("members.email")}</th>
                <th className="px-3 py-2">{t("members.role")}</th>
                <th className="px-3 py-2">{t("members.joined")}</th>
                {canManage && <th className="px-3 py-2">{t("members.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.user.id === user.id;
                const manageable = canManage && member.role !== "OWNER" && outranksOrEquals(workspace.role, member.role);
                const removable = manageable && !isSelf;
                return (
                  <tr key={member.user.id} data-member-role={member.role}>
                    <td className="px-3 py-3 font-medium">
                      {isSelf ? t("members.you", { name: member.user.display_name }) : member.user.display_name}
                    </td>
                    <td className="px-3 py-3">{member.user.email}</td>
                    <td className="px-3 py-3">
                      {manageable && member.role !== "OWNER" ? (
                        <MemberRoleSelect
                          workspaceId={workspace.id}
                          userId={member.user.id}
                          memberName={member.user.display_name}
                          role={member.role}
                        />
                      ) : (
                        t(`roles.${member.role}`)
                      )}
                    </td>
                    <td className="px-3 py-3">{formatDate(member.created_at, format)}</td>
                    {canManage && (
                      <td className="px-3 py-3">
                        {removable && (
                          <RemoveMemberButton workspaceId={workspace.id} userId={member.user.id} memberName={member.user.display_name} />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("invites.title")}</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">{t("invites.empty")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {invite.email} · {t(`roles.${invite.role}`)} · {t("invites.expires")} {formatDate(invite.expires_at, format)}
                </span>
                {canManage && <RevokeInviteButton workspaceId={workspace.id} inviteId={invite.id} email={invite.email} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && <InviteForm workspaceId={workspace.id} />}

      {canTransfer && others.length > 0 && (
        <TransferOwnershipForm
          workspaceId={workspace.id}
          members={others.map((member) => ({ id: member.user.id, name: member.user.display_name }))}
        />
      )}

      {!workspace.isPersonal && (
        <section className="card space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{t("leave.title")}</h2>
            <p className="text-sm text-slate-600">{t("leave.intro")}</p>
          </div>
          <LeaveWorkspaceButton workspaceId={workspace.id} workspaceName={workspace.name} />
        </section>
      )}
    </div>
  );
}
