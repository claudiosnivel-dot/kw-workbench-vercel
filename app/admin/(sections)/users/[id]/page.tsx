import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AdminAuditLogCard } from "@/components/admin-audit-log-card";
import { AdminUserActions, AdminUserDeleteButton } from "@/components/admin-user-actions";
import { CardIntro } from "@/components/card-intro";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { requireAdminPageUser } from "@/lib/admin/page-access";
import { getAdminUserDetail } from "@/lib/admin/user-detail";
import { formatDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

/**
 * Scheda dell'utente (T-3401), nella sezione Utenti: intestazione, Riepilogo, Workspace e Registro (solo root admin),
 * Azioni ed Elimina per gli utenti che l'admin può gestire. Le regole di visibilità sono quelle dell'elenco: un utente
 * fuori dal perimetro dell'admin non root è una pagina che non esiste (CWE-639).
 */
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdminPageUser();
  const { id } = await params;
  const detail = await getAdminUserDetail(viewer, id);
  if (!detail) {
    notFound();
  }
  const [t, tWorkspace, format] = await Promise.all([getTranslations("admin"), getTranslations("workspace"), getFormatter()]);
  // Come nelle rotte (T-507): mai il root admin né sé stessi; l'admin non root solo i sottoscrittori, già filtrati sopra.
  const canManage = !detail.isRootAdmin && detail.id !== viewer.id;
  const managed = { id: detail.id, displayName: detail.displayName, email: detail.email, role: detail.role, status: detail.status };

  return (
    <>
      <Link href="/admin/users" className="text-sm underline underline-offset-2">
        {t("user.back")}
      </Link>

      <header className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{detail.displayName}</h2>
          {detail.isRootAdmin && <span className="status-chip">{t("manage.rootBadge")}</span>}
        </div>
        <p className="text-sm text-slate-600">
          {detail.email ?? t("manage.noEmail")}
          {detail.email && ` · ${t(detail.emailVerified ? "user.emailVerified" : "user.emailNotVerified")}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="status-chip">{t(`statuses.${detail.status}`)}</span>
          <span className="status-chip">{t(`roles.${detail.role}`)}</span>
        </div>
      </header>

      <section className="card space-y-3" data-testid="admin-user-summary">
        <CardIntro title={t("user.summary.title")} />
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-slate-600">{t("user.summary.created")}</dt>
          <dd>{formatDate(detail.createdAt, format)}</dd>
          <dt className="text-slate-600">{t("user.summary.lastLogin")}</dt>
          <dd>{formatDate(detail.lastLoginAt, format)}</dd>
          <dt className="text-slate-600">{t("user.summary.terms")}</dt>
          <dd>
            {detail.acceptedTermsVersion
              ? t("user.summary.termsValue", { version: detail.acceptedTermsVersion, date: formatDate(detail.acceptedTermsAt, format) })
              : t("user.summary.termsMissing")}
          </dd>
        </dl>
      </section>

      {detail.workspaces && (
        <section className="card space-y-3" data-testid="admin-user-workspaces">
          <CardIntro title={t("user.workspaces.title")} intro={t("user.workspaces.intro")} />
          {detail.workspaces.length === 0 ? (
            <p className="text-sm text-slate-600">{t("user.workspaces.empty")}</p>
          ) : (
            <div className="table-shell">
              <table className="table-enterprise text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2">{t("user.workspaces.name")}</th>
                    <th className="px-3 py-2">{t("user.workspaces.role")}</th>
                    <th className="px-3 py-2">{t("user.workspaces.projects")}</th>
                    <th className="px-3 py-2">{t("user.workspaces.keywords")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.workspaces.map((workspace) => (
                    <tr key={workspace.id}>
                      <td className="px-3 py-2">
                        {workspace.name}
                        {workspace.personal && <span className="ml-2 text-xs text-slate-600">{t("user.workspaces.personal")}</span>}
                      </td>
                      <td className="px-3 py-2">{tWorkspace(`roles.${workspace.role}`)}</td>
                      <td className="px-3 py-2">{format.number(workspace.projectCount)}</td>
                      <td className="px-3 py-2">{format.number(workspace.keywordsThisMonth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canManage && <AdminUserActions user={managed} viewerIsRoot={viewer.isRootAdmin} />}

      {detail.audit && (
        <AdminAuditLogCard
          initial={{ rows: detail.audit, nextCursor: null }}
          title={t("user.audit.title")}
          intro={t("user.audit.intro")}
        />
      )}

      {canManage && (
        <DangerZoneCard warning={t("user.danger.warning")}>
          <AdminUserDeleteButton user={managed} />
        </DangerZoneCard>
      )}
    </>
  );
}
