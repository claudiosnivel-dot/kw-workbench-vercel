"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";
import { ConfirmedActionButton } from "@/components/confirmed-action-button";
import { sendJson } from "@/lib/client/http";
import { formatDate } from "@/lib/view/format";

type LaunchView = {
  status: "paused" | "live";
  changedAt: string | null;
  changedBy: string | null;
  checklist: { id: "plans" | "paddle" | "email" | "legal" | "captcha"; ok: boolean; requires: string }[];
};

const changeLaunch = (status: LaunchView["status"]) => () => sendJson("PATCH", "/api/admin/launch", { status });

/**
 * Interruttore del lancio commerciale (T-1606), solo per il root admin: stato, checklist con l'esito di ogni voce e ciò
 * che la soddisfa, attivazione possibile solo con la checklist completa e ritorno alla pausa, entrambi con conferma.
 * La rotta riverifica ruolo e checklist.
 */
export function AdminLaunchCard({ launch }: { launch: LaunchView }) {
  const t = useTranslations("admin.launch");
  const format = useFormatter();
  const ready = launch.checklist.every((item) => item.ok);

  return (
    <section className="card space-y-4" data-testid="admin-launch-card">
      <CardIntro title={t("title")} intro={t("intro")} />
      <p className="text-sm font-medium">{t("status", { status: t(`statuses.${launch.status}`) })}</p>
      {launch.changedAt && launch.changedBy && (
        <p className="text-sm text-slate-600">{t("changed", { date: formatDate(launch.changedAt, format), by: launch.changedBy })}</p>
      )}

      <div>
        <h3 className="text-sm font-semibold">{t("checklist")}</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {launch.checklist.map((item) => (
            <li key={item.id} data-testid={`launch-item-${item.id}`}>
              <span className={item.ok ? "text-green-700" : "text-red-700"}>{item.ok ? t("ok") : t("missing")}</span>
              {" · "}
              <span className="font-medium">{t(`items.${item.id}`)}</span>
              <span className="block text-xs text-slate-600">{t("requires", { requires: item.requires })}</span>
            </li>
          ))}
        </ul>
      </div>

      {launch.status === "live" ? (
        <ConfirmedActionButton
          confirmText={t("pauseConfirm")}
          label={t("pause")}
          pendingLabel={t("pausing")}
          request={changeLaunch("paused")}
        />
      ) : ready ? (
        <ConfirmedActionButton
          confirmText={t("activateConfirm")}
          label={t("activate")}
          pendingLabel={t("activating")}
          request={changeLaunch("live")}
          className="btn-primary"
        />
      ) : (
        <button type="button" className="btn-primary" disabled>
          {t("activate")}
        </button>
      )}
    </section>
  );
}
