"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { type ApiErrorPayload, readApiResponse } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";
import { formatDate } from "@/lib/view/format";

type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
};

type AuditPage = ApiErrorPayload & { data?: AuditRow[]; meta?: { nextCursor: string | null } };

/**
 * Registro delle azioni amministrative (T-1704), solo per il root admin: la prima pagina arriva dal server, le
 * successive da GET /api/admin/audit-log con il cursore. La rotta riverifica il ruolo.
 */
export function AdminAuditLogCard({ initial }: { initial: { rows: AuditRow[]; nextCursor: string | null } }) {
  const t = useTranslations("admin.audit");
  const format = useFormatter();
  const [rows, setRows] = useState(initial.rows);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const { saving, error, save } = useSaveAction();

  const loadMore = () =>
    save(async (tErrors) => {
      const response = await fetch(`/api/admin/audit-log?cursor=${encodeURIComponent(cursor ?? "")}`);
      const page = await readApiResponse<AuditPage>(response, tErrors);
      setRows((current) => [...current, ...(page?.data ?? [])]);
      setCursor(page?.meta?.nextCursor ?? null);
      return "";
    });

  return (
    <section className="card space-y-4" data-testid="admin-audit-log">
      <CardIntro title={t("title")} intro={t("intro")} />
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-200 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="py-2">
              <p>
                <span className="text-slate-600">{formatDate(row.createdAt, format)}</span>
                {" · "}
                <code>{row.action}</code>
                {" · "}
                {row.actorEmail ?? t("system")}
              </p>
              <p className="break-all text-xs text-slate-600">
                {row.targetType}
                {row.targetId ? ` ${row.targetId}` : ""} {JSON.stringify(row.metadata)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button type="button" className="btn-secondary" onClick={loadMore} disabled={saving}>
          {saving ? t("loading") : t("loadMore")}
        </button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
