"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { FormFeedback } from "@/components/form-feedback";
import { type ErrorTranslator, readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";
import { AGENT_DAILY_CAP_MAX_USD, type AgentSpend } from "@/lib/modules/agent/key-types";

const ENDPOINT = "/api/admin/agent-key/settings";
const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

/**
 * Tetto giornaliero di spesa di Claude Code nella card «Claude Code» (T-7302, D-65): importo in dollari da 0 a 100 con
 * due decimali e la spesa di oggi (giorno UTC) dei lavori di Claude Code. La rotta riverifica il root admin e l'importo.
 * onSaved riceve la spesa e il tetto salvati (l'attività della card, T-7602).
 */
export function AgentSpendCapField({ initial, onSaved }: { initial: AgentSpend; onSaved?: (spend: AgentSpend) => void }) {
  const t = useTranslations("admin.agentKey");
  const format = useFormatter();
  const capId = useId();
  const { saving, error, success, save } = useSaveAction();
  const [spend, setSpend] = useState(initial);
  const [value, setValue] = useState(initial.capUsd.toFixed(2));

  /** PATCH del tetto: con la risposta la spesa e l'importo mostrati sono quelli salvati. */
  const saveCap = async (tErrors: ErrorTranslator) => {
    const response = await sendJson("PATCH", ENDPOINT, { dailyCapUsd: Number(value) });
    const saved = (await readApiResponse<{ data: AgentSpend }>(response, tErrors))?.data;
    if (saved) {
      setSpend(saved);
      setValue(saved.capUsd.toFixed(2));
      onSaved?.(saved);
    }
    return t("capSaved");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(saveCap);
  };

  return (
    <form className="space-y-2" onSubmit={submit} data-testid="agent-spend-cap">
      <label className="label" htmlFor={capId}>
        {t("capLabel")}
      </label>
      <input
        id={capId}
        className="input"
        type="number"
        inputMode="decimal"
        min={0}
        max={AGENT_DAILY_CAP_MAX_USD}
        step={0.01}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <p className="text-sm">
        {t("spentToday", { spent: format.number(spend.spentTodayUsd, USD), cap: format.number(spend.capUsd, USD) })}
      </p>
      <button type="submit" className="btn-secondary" disabled={saving}>
        {saving ? t("capSaving") : t("capSave")}
      </button>
      <FormFeedback error={error} success={success} />
    </form>
  );
}
