"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";
import { formatDate } from "@/lib/view/format";

type UserRole = "ADMIN" | "SUBSCRIBER";
type UserStatus = "ACTIVE" | "SUSPENDED";

type AdminUserRecord = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type AdminUsersTotals = {
  totalUsers: number;
  totalAdmins: number | null;
  totalSubscribers: number;
  totalActive: number;
  totalSuspended: number;
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
const SEARCH_DEBOUNCE_MS = 300;

// Etichette di ruoli e stati nei cataloghi (admin.roles, admin.statuses, T-1303).
const ROLE_OPTIONS: UserRole[] = ["ADMIN", "SUBSCRIBER"];
const STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "SUSPENDED"];

export function AdminUsersDashboard({
  viewer,
}: {
  viewer: { id: string; username: string; isRootAdmin: boolean };
}) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [totals, setTotals] = useState<AdminUsersTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | UserStatus>("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Richiesta della lista in corso: una nuova la annulla, così vince sempre l'ultima.
  const inFlight = useRef<AbortController | null>(null);

  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirmPassword, setCreateConfirmPassword] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("SUBSCRIBER");
  const [creating, setCreating] = useState(false);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, UserStatus>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  const availableCreateRoles = useMemo(
    () => (viewer.isRootAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => role === "SUBSCRIBER")),
    [viewer.isRootAdmin]
  );

  const loadUsers = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("searchText", debouncedSearch);
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
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

      const nextRoleDrafts: Record<string, UserRole> = {};
      const nextStatusDrafts: Record<string, UserStatus> = {};
      for (const user of nextUsers) {
        nextRoleDrafts[user.id] = user.role;
        nextStatusDrafts[user.id] = user.status;
      }
      setRoleDrafts(nextRoleDrafts);
      setStatusDrafts(nextStatusDrafts);
    } catch (loadError) {
      if (controller.signal.aborted) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : tCommon("unexpectedError"));
    } finally {
      if (inFlight.current === controller) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, page, roleFilter, statusFilter, tCommon, tErrors]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Ricerca con debounce: parte una sola richiesta quando si smette di digitare, dalla prima pagina.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onCreateUser = async () => {
    setCreating(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createUsername,
          password: createPassword,
          confirmPassword: createConfirmPassword,
          role: createRole,
        }),
      });

      await readApiResponse<ApiErrorPayload>(response, tErrors);

      setCreateUsername("");
      setCreatePassword("");
      setCreateConfirmPassword("");
      setCreateRole("SUBSCRIBER");
      setFeedback(t("create.created"));
      await loadUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : tCommon("unexpectedError"));
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (userId: string, payload: { role?: UserRole; status?: UserStatus; newPassword?: string }) => {
    setUpdatingId(userId);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: payload.role,
          status: payload.status,
          newPassword: payload.newPassword,
          confirmPassword: payload.newPassword,
        }),
      });

      await readApiResponse<ApiErrorPayload>(response, tErrors);

      setFeedback(t("manage.updated"));
      setPasswordDrafts((current) => ({ ...current, [userId]: "" }));
      await loadUsers();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : tCommon("unexpectedError"));
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteUser = async (user: AdminUserRecord) => {
    const confirmed = window.confirm(t("manage.deleteConfirm", { username: user.username }));
    if (!confirmed) return;

    setDeletingId(user.id);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });

      await readApiResponse<ApiErrorPayload>(response, tErrors);

      setFeedback(t("manage.deleted"));
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : tCommon("unexpectedError"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("totals.users")}</p>
          <p className="mt-1 text-2xl font-semibold">{totals?.totalUsers ?? "-"}</p>
        </article>
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("totals.admins")}</p>
          <p className="mt-1 text-2xl font-semibold">{totals?.totalAdmins ?? "-"}</p>
        </article>
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("totals.subscribers")}</p>
          <p className="mt-1 text-2xl font-semibold">{totals?.totalSubscribers ?? "-"}</p>
        </article>
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("totals.active")}</p>
          <p className="mt-1 text-2xl font-semibold">{totals?.totalActive ?? "-"}</p>
        </article>
        <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t("totals.suspended")}</p>
          <p className="mt-1 text-2xl font-semibold">{totals?.totalSuspended ?? "-"}</p>
        </article>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="w-full lg:max-w-sm">
            <label className="label" htmlFor="admin-search">
              {t("filters.search")}
            </label>
            <input
              id="admin-search"
              className="input"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
            />
          </div>

          <div className="w-full lg:max-w-xs">
            <label className="label" htmlFor="admin-role-filter">
              {t("filters.role")}
            </label>
            <select
              id="admin-role-filter"
              className="select"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as "ALL" | UserRole);
                setPage(1);
              }}
            >
              <option value="ALL">{t("filters.all")}</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full lg:max-w-xs">
            <label className="label" htmlFor="admin-status-filter">
              {t("filters.status")}
            </label>
            <select
              id="admin-status-filter"
              className="select"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as "ALL" | UserStatus);
                setPage(1);
              }}
            >
              <option value="ALL">{t("filters.all")}</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </select>
          </div>

          <button className="btn-secondary w-full lg:w-auto" type="button" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? t("filters.refreshing") : t("filters.apply")}
          </button>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("create.title")}</h2>
        {!viewer.isRootAdmin && <p className="text-sm text-slate-600">{t("create.nonRootHint")}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="new-username">
              {tAuth("username")}
            </label>
            <input
              id="new-username"
              className="input"
              value={createUsername}
              onChange={(event) => setCreateUsername(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="new-role">
              {t("filters.role")}
            </label>
            <select id="new-role" className="select" value={createRole} onChange={(event) => setCreateRole(event.target.value as UserRole)}>
              {availableCreateRoles.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="new-password">
              {tAuth("password")}
            </label>
            <input
              id="new-password"
              className="input"
              type="password"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="new-confirm-password">
              {tAuth("confirmPassword")}
            </label>
            <input
              id="new-confirm-password"
              className="input"
              type="password"
              value={createConfirmPassword}
              onChange={(event) => setCreateConfirmPassword(event.target.value)}
            />
          </div>
        </div>

        <button className="btn-primary w-full sm:w-auto" type="button" onClick={onCreateUser} disabled={creating}>
          {creating ? t("create.creating") : t("create.submit")}
        </button>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("manage.title")}</h2>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {feedback && <p className="text-sm text-green-700">{feedback}</p>}

        <div className="table-shell">
          <table className="table-enterprise min-w-[1240px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("manage.columns.username")}</th>
                <th className="px-3 py-2">{t("manage.columns.role")}</th>
                <th className="px-3 py-2">{t("manage.columns.status")}</th>
                <th className="px-3 py-2">{t("manage.columns.created")}</th>
                <th className="px-3 py-2">{t("manage.columns.lastLogin")}</th>
                <th className="px-3 py-2">{t("manage.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const canManage = viewer.isRootAdmin ? !user.isRootAdmin : user.role === "SUBSCRIBER";
                const canEditRole = viewer.isRootAdmin && !user.isRootAdmin;
                const canDelete = canManage && user.id !== viewer.id;

                return (
                  <tr key={user.id}>
                    <td className="px-3 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{user.username}</span>
                        {user.isRootAdmin && <span className="status-chip border-emerald-400/40 bg-emerald-500/15 text-emerald-200">{t("manage.rootBadge")}</span>}
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      {canEditRole ? (
                        <select
                          className="select"
                          value={roleDrafts[user.id] ?? user.role}
                          onChange={(event) =>
                            setRoleDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value as UserRole,
                            }))
                          }
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {t(`roles.${role}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="status-chip">{t(`roles.${user.role}`)}</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {canManage ? (
                        <select
                          className="select"
                          value={statusDrafts[user.id] ?? user.status}
                          onChange={(event) =>
                            setStatusDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value as UserStatus,
                            }))
                          }
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {t(`statuses.${status}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="status-chip">{t(`statuses.${user.status}`)}</span>
                      )}
                    </td>

                    <td className="px-3 py-3">{formatDate(user.createdAt, format)}</td>
                    <td className="px-3 py-3">{formatDate(user.lastLoginAt, format)}</td>

                    <td className="px-3 py-3">
                      <div className="flex min-w-[380px] flex-wrap items-center gap-2">
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={!canManage || updatingId === user.id}
                          onClick={() =>
                            void updateUser(user.id, {
                              role: roleDrafts[user.id],
                              status: statusDrafts[user.id],
                            })
                          }
                        >
                          {updatingId === user.id ? tCommon("saving") : t("manage.save")}
                        </button>

                        <input
                          className="input min-w-[180px]"
                          type="password"
                          placeholder={t("manage.newPasswordPlaceholder")}
                          value={passwordDrafts[user.id] ?? ""}
                          onChange={(event) =>
                            setPasswordDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value,
                            }))
                          }
                        />

                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={!canManage || !passwordDrafts[user.id] || updatingId === user.id}
                          onClick={() =>
                            void updateUser(user.id, {
                              newPassword: passwordDrafts[user.id],
                            })
                          }
                        >
                          {t("manage.resetPassword")}
                        </button>

                        <button
                          className="btn btn-danger"
                          type="button"
                          disabled={!canDelete || deletingId === user.id}
                          onClick={() => void deleteUser(user)}
                        >
                          {deletingId === user.id ? tCommon("deleting") : tCommon("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && users.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-sm text-slate-500" colSpan={6}>
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
    </div>
  );
}