"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import type { AgentCallView, AgentSpend } from "@/lib/modules/agent/key-types";
import { formatDate } from "@/lib/view/format";

/** Dollari con il simbolo e i decimali solo se servono: «1,25 $», «5 $». */
const USD = {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  trailingZeroDisplay: "stripIfInteger",
} as const;

/**
 * Attività di Claude Code nella card «Claude Code» (T-7602): la spesa di oggi con il tetto («1,25 $ di 5 $ oggi») e le
 * ultime 50 chiamate dal registro, con ora, strumento, progetto (link al progetto se esiste ancora), esito e durata; mai
 * parametri o testi (CWE-532). Le righe vanno a capo a 390 px invece di scorrere in orizzontale.
 */
export function AgentActivityList({ calls, spend }: { calls: AgentCallView[]; spend: AgentSpend }) {
  const t = useTranslations("admin.agentKey.activity");
  const format = useFormatter();
  const titleId = useId();

  return (
    <section className="space-y-2" aria-labelledby={titleId} data-testid="agent-activity">
      <h3 id={titleId} className="text-sm font-semibold">
        {t("title")}
      </h3>
      <p className="text-sm">{t("spend", { spent: format.number(spend.spentTodayUsd, USD), cap: format.number(spend.capUsd, USD) })}</p>
      {calls.length === 0 ? (
        <p className="text-sm text-slate-600">{t("empty")}</p>
      ) : (
        <ul className="agent-activity-list text-sm" aria-labelledby={titleId}>
          {calls.map((call) => (
            <li key={call.id} className="agent-activity-row">
              <span className="text-slate-600">{formatDate(call.at, format)}</span>
              <span className="font-mono font-medium">{call.tool}</span>
              {call.project ? (
                <Link className="underline" href={`/projects/${call.project.id}`}>
                  {call.project.name}
                </Link>
              ) : (
                <span className="text-slate-600">{t("noProject")}</span>
              )}
              <span className={call.ok ? "text-green-700" : "text-red-700"} data-outcome={call.ok ? "ok" : "error"}>
                {call.ok ? t("ok") : t("error", { code: call.errorCode ?? "" })}
              </span>
              <span>{t("duration", { duration: format.number(call.durationMs / 1000, { maximumFractionDigits: 1 }) })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
