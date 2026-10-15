import { getFormatter, getTranslations } from "next-intl/server";
import { InviteButton, RenewInviteButton } from "@/components/invite-dialog";
import { MemberRoleSelect, RemoveMemberButton, RevokeInviteButton } from "@/components/workspace-controls";
import { canPerform, outranksOrEquals } from "@/lib/authz/permissions";
import { formatDate } from "@/lib/view/format";
import { requireCurrentWorkspace } from "@/lib/workspaces/current";
import { listOpenInvites } from "@/lib/workspaces/invites";
import { listMembers } from "@/lib/workspaces/members";

export const dynamic = "force-dynamic";

/**
 * Sezione Membri del workspace (T-3101, T-1504): membri con l'email sotto il nome, ruolo e data di ingresso; inviti
 * aperti, scaduti compresi con l'etichetta «Scaduto» (T-3202), e «Invita una persona» (T-3201). Ruolo, «Rimuovi»,
 * «Nuovo link», «Revoca» e invito solo con members.manage (T-1502), riverificati dalle rotte.
 */
export default async function WorkspaceMembersPage() {
  const { user, workspace } = await requireCurrentWorkspace();
  const [members, invites, t, format] = await Promise.all([
    listMembers(workspace.id),
    listOpenInvites(workspace.id),
    getTranslations("workspace"),
    getFormatter(),
  ]);
  const canManage = canPerform(workspace.role, "members.manage");

  return (
    <>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("members.title")}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("members.name")}</th>
                <th className="px-3 py-2">{t("members.role")}</th>
                <th className="px-3 py-2">{t("members.joined")}</th>
                {canManage && <th className="px-3 py-2">{t("members.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.user.id === user.id;
                const manageable = canManage && member.role !== "OWNER" && outranksOrEquals(workspace.role, member.role);
                return (
                  <tr key={member.user.id} data-member-role={member.role}>
                    <td className="px-3 py-3">
                      <span className="block font-medium">
                        {isSelf ? t("members.you", { name: member.user.display_name }) : member.user.display_name}
                      </span>
                      <span className="block text-xs text-slate-500">{member.user.email}</span>
                    </td>
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
                        {manageable && !isSelf && (
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

      <section className="card space-y-4" aria-labelledby="invites-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="invites-title" className="text-lg font-semibold">
            {t("invites.title")}
          </h2>
          {canManage && <InviteButton workspaceId={workspace.id} />}
        </div>
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">{t("invites.empty")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {invite.email} · {t(`roles.${invite.role}`)} ·{" "}
                  {invite.expired ? <span className="status-chip">{t("invites.expired")}</span> : t("invites.expires")}{" "}
                  {formatDate(invite.expires_at, format)}
                </span>
                {canManage && (
                  <span className="flex flex-wrap items-start gap-2">
                    <RenewInviteButton workspaceId={workspace.id} inviteId={invite.id} />
                    <RevokeInviteButton workspaceId={workspace.id} inviteId={invite.id} email={invite.email} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
