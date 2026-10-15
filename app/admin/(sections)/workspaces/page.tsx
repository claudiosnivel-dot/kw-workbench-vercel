import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CardIntro } from "@/components/card-intro";
import { PaginationLinks } from "@/components/pagination-links";
import { requireRootAdminPageUser } from "@/lib/admin/page-access";
import { listAdminWorkspaces } from "@/lib/admin/workspaces";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Workspace della piattaforma (T-3403), del solo root admin: nome, proprietario (porta alla sua scheda, T-3401), membri,
 * progetti e piano, 50 per pagina con la ricerca nell'indirizzo. Dei progetti si vede solo il numero (T-1705).
 */
export default async function AdminWorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRootAdminPageUser();
  const query = await searchParams;
  const searchText = typeof query.searchText === "string" ? query.searchText.trim() : "";
  const [list, t, format] = await Promise.all([
    listAdminWorkspaces({ searchText, page: Number(query.page ?? 1) }),
    getTranslations("admin.workspaces"),
    getFormatter(),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const pageHref = (target: number) =>
    `/admin/workspaces?${new URLSearchParams(searchText ? { searchText, page: String(target) } : { page: String(target) })}`;

  return (
    <section className="card space-y-4" data-testid="admin-workspaces">
      <CardIntro title={t("title")} intro={t("intro")} />
      <form method="get" action="/admin/workspaces" role="search" className="flex flex-wrap items-end gap-2">
        <label className="w-full space-y-1 lg:max-w-sm">
          <span className="label">{t("search")}</span>
          <input name="searchText" type="search" className="input" defaultValue={searchText} placeholder={t("searchPlaceholder")} />
        </label>
        <button type="submit" className="btn-secondary">
          {t("searchSubmit")}
        </button>
      </form>

      <div className="table-shell">
        <table className="table-enterprise min-w-[640px] text-left text-sm sm:min-w-full">
          <thead>
            <tr>
              <th className="px-3 py-2">{t("columns.name")}</th>
              <th className="px-3 py-2">{t("columns.owner")}</th>
              <th className="px-3 py-2">{t("columns.members")}</th>
              <th className="px-3 py-2">{t("columns.projects")}</th>
              <th className="px-3 py-2">{t("columns.plan")}</th>
            </tr>
          </thead>
          <tbody>
            {list.workspaces.map((workspace) => (
              <tr key={workspace.id}>
                <td className="px-3 py-3 font-medium">
                  {workspace.name}
                  {workspace.personal && <span className="ml-2 text-xs font-normal text-slate-600">{t("personal")}</span>}
                </td>
                <td className="px-3 py-3">
                  {workspace.owner ? (
                    <Link href={`/admin/users/${workspace.owner.id}`} className="underline underline-offset-2">
                      {workspace.owner.displayName}
                    </Link>
                  ) : (
                    t("noOwner")
                  )}
                </td>
                <td className="px-3 py-3">{format.number(workspace.membersCount)}</td>
                <td className="px-3 py-3">{format.number(workspace.projectCount)}</td>
                <td className="px-3 py-3">{workspace.plan}</td>
              </tr>
            ))}
            {list.workspaces.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-slate-500" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-600">{t("pageInfo", { page: list.page, totalPages, total: list.total })}</p>
        <PaginationLinks
          previousHref={list.page > 1 ? pageHref(list.page - 1) : null}
          nextHref={list.page < totalPages ? pageHref(list.page + 1) : null}
        />
      </div>
    </section>
  );
}
