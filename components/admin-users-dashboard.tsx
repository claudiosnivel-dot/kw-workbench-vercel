"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AdminUserFilter, AdminUserFilters, type AdminUsersTotals } from "@/components/admin-user-filters";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { FormFeedback } from "@/components/form-feedback";
import { ApiErrorPayload, messageOf, readApiResponse } from "@/lib/client/http";
import { formatDate } from "@/lib/view/format";

type UserRole = "ADMIN" | "SUBSCRIBER";
type UserStatus = "ACTIVE" | "SUSPENDED";

type AdminUserRecord = {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type AdminUsersResponse = ApiErrorPayload & {
  data?: {
    users: AdminUserRecord[];
    totals: AdminUsersTotals;
    page: number;
    pageSize: number;
    total: number;
  };
};

const PAGE_SIZE = 50;

/** Parametri della richiesta per il filtro a pulsante (T-3303): stato per attivi e sospesi, ruolo per gli admin. */
const FILTER_PARAMS: Record<AdminUserFilter, [string, string] | null> = {
  ALL: null,
  ACTIVE: ["status", "ACTIVE"],
  SUSPENDED: ["status", "SUSPENDED"],
  ADMIN: ["role", "ADMIN"],
};

/**
 * Elenco degli utenti dell'amministrazione con la paginazione (T-507, T-3303): ricerca e filtri in AdminUserFilters,
 * creazione nella finestra di CreateUserDialog. Il nome di ogni riga porta alla scheda dell'utente (T-3401), dove stanno
 * le azioni; le rotte applicano le regole di visibilità e di gestione.
 */
export function AdminUsersDashboard({
  viewer,
}: {
  viewer: { id: string; isRootAdmin: boolean };
}) {
  const t = useTranslations("admin");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [totals, setTotals] = useState<AdminUsersTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<AdminUserFilter>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Richiesta della lista in corso: una nuova la annulla, così vince sempre l'ultima.
  const inFlight = useRef<AbortController | null>(null);

  const loadUsers = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchText) params.set("searchText", searchText);
      const filterParam = FILTER_PARAMS[filter];
      if (filterParam) params.set(...filterParam);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        signal: controller.signal,
      });

      const payload = await readApiResponse<AdminUsersResponse>(response, tErrors);

      const nextUsers = payload?.data?.users ?? [];
      setUsers(nextUsers);
      setTotals(payload?.data?.totals ?? null);
      setTotal(payload?.data?.total ?? nextUsers.length);
    } catch (loadError) {
      if (controller.signal.aborted) {
        return;
      }
      setError(messageOf(loadError, tCommon("unexpectedError")));
    } finally {
      if (inFlight.current === controller) {
        setLoading(false);
      }
    }
  }, [searchText, page, filter, tCommon, tErrors]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Ricerca e filtri ripartono dalla prima pagina.
  const onSearch = useCallback((text: string) => {
    setSearchText(text);
    setPage(1);
  }, []);

  const onFilterChange = (next: AdminUserFilter) => {
    setFilter(next);
    setPage(1);
  };

  const onCreated = () => {
    setError(null);
    setFeedback(t("create.created"));
    void loadUsers();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{t("manage.title")}</h2>
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          {t("create.open")}
        </button>
      </div>
      {createOpen && (
        <CreateUserDialog isRootAdmin={viewer.isRootAdmin} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
      )}

      <AdminUserFilters
        totals={totals}
        isRootAdmin={viewer.isRootAdmin}
        filter={filter}
        onFilterChange={onFilterChange}
        onSearch={onSearch}
      />

      <FormFeedback error={error} success={feedback} />

      <div className="table-shell">
        <table className="table-enterprise min-w-[640px] text-left text-sm sm:min-w-full">
          <thead>
            <tr>
              <th className="px-3 py-2">{t("manage.columns.user")}</th>
              <th className="px-3 py-2">{t("manage.columns.role")}</th>
              <th className="px-3 py-2">{t("manage.columns.status")}</th>
              <th className="px-3 py-2">{t("manage.columns.lastLogin")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-3 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/users/${user.id}`} className="underline underline-offset-2">
                      {user.displayName}
                    </Link>
                    {user.isRootAdmin && <span className="status-chip border-emerald-400/40 bg-emerald-500/15 text-emerald-200">{t("manage.rootBadge")}</span>}
                  </div>
                  <div className="text-xs font-normal text-slate-500">{user.email ?? t("manage.noEmail")}</div>
                </td>
                <td className="px-3 py-3">
                  <span className="status-chip">{t(`roles.${user.role}`)}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="status-chip">{t(`statuses.${user.status}`)}</span>
                </td>
                <td className="px-3 py-3">{formatDate(user.lastLoginAt, format)}</td>
              </tr>
            ))}

            {!loading && users.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-sm text-slate-500" colSpan={4}>
                  {t("manage.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">{t("manage.pageInfo", { page, totalPages, total })}</p>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("manage.previous")}
          </button>
          <button
            className="btn-secondary"
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("manage.next")}
          </button>
        </div>
      </div>
    </section>
  );
}