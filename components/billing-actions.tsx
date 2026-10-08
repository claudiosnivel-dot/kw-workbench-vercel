"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { FormFeedback } from "@/components/form-feedback";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

// Azioni dell'OWNER nella pagina di fatturazione (T-1604): la pagina le rende solo a chi ha billing.manage, le rotte
// riverificano ruolo e lancio a ogni richiesta. Lo stato locale cambia solo con i webhook di Paddle.

/** Pulsante di un'azione di fatturazione con il suo esito (data-testid billing-action, contato dagli E2E). */
export function BillingActionButton({
  label,
  busyLabel,
  busy,
  onClick,
  error,
  success,
  primary = false,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  onClick: () => void;
  error: string | null;
  success?: string | null;
  primary?: boolean;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={primary ? "btn-primary" : "btn-secondary"}
        disabled={busy}
        onClick={onClick}
        data-testid="billing-action"
      >
        {busy ? busyLabel : label}
      </button>
      <FormFeedback error={error} success={success} />
    </div>
  );
}

/**
 * Portale cliente di Paddle in una nuova scheda (mai in un iframe): la scheda si apre al clic, senza opener, e riceve
 * il link temporaneo appena la rotta lo restituisce; il link non viene salvato (CWE-524).
 */
export function BillingPortalButton({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("billing");
  const { saving, error, save } = useSaveAction();

  const open = () => {
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
    }
    void save(async (tErrors) => {
      try {
        const payload = await readApiResponse<{ data: { url: string } }>(
          await sendJson("POST", "/api/billing/portal", { workspaceId }),
          tErrors
        );
        if (tab && payload) {
          tab.location.href = payload.data.url;
        }
        return "";
      } catch (portalError) {
        tab?.close();
        throw portalError;
      }
    });
  };

  return <BillingActionButton label={t("portal")} busyLabel={t("opening")} busy={saving} onClick={open} error={error} />;
}

type PlanOption = { value: string; label: string };

/** Cambio piano (T-1604): la richiesta parte subito, il nuovo piano compare quando arriva il webhook. */
export function ChangePlanForm({ workspaceId, options }: { workspaceId: string; options: PlanOption[] }) {
  const t = useTranslations("billing");
  const [choice, setChoice] = useState(options[0]?.value ?? "");
  const { saving, error, success, save } = useSaveAction();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const [planId, interval] = choice.split(":");
    void save(async (tErrors) => {
      await readApiResponse(await sendJson("POST", "/api/billing/change-plan", { workspaceId, planId, interval }), tErrors);
      return t("changeRequested");
    });
  };

  return (
    <form className="space-y-2" onSubmit={submit}>
      <label className="block text-sm font-medium" htmlFor="billing-change-plan">
        {t("changePlanLabel")}
      </label>
      <select id="billing-change-plan" className="select" value={choice} onChange={(event) => setChoice(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-secondary" disabled={saving || !choice} data-testid="billing-action">
        {saving ? t("changing") : t("changePlan")}
      </button>
      <FormFeedback error={error} success={success} />
    </form>
  );
}

/** Disdetta a fine periodo (T-1604), con conferma: la data di fine compare quando arriva il webhook. */
export function CancelSubscriptionButton({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("billing");
  const { saving, error, success, save } = useSaveAction();

  const cancel = () => {
    if (!window.confirm(t("cancelConfirm"))) {
      return;
    }
    void save(async (tErrors) => {
      await readApiResponse(await sendJson("POST", "/api/billing/cancel", { workspaceId }), tErrors);
      return t("cancelRequested");
    });
  };

  return (
    <BillingActionButton
      label={t("cancel")}
      busyLabel={t("canceling")}
      busy={saving}
      onClick={cancel}
      error={error}
      success={success}
    />
  );
}
