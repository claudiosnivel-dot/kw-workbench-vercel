"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PLAN_LIMIT_EVENT } from "@/lib/client/http";

/**
 * Invito all'upgrade dopo una risposta 402 PLAN_LIMIT di qualunque API (T-1605): per l'OWNER il link alla pagina di
 * fatturazione, per gli altri ruoli l'invito a contattare il proprietario. Informativo: i limiti li applica il server.
 */
export function PlanLimitNotice({ canManageBilling }: { canManageBilling: boolean }) {
  const t = useTranslations("billing.limit");
  const tCommon = useTranslations("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(PLAN_LIMIT_EVENT, show);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, show);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div role="alert" data-testid="plan-limit-notice" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>{canManageBilling ? t("owner") : t("member")}</p>
        <div className="flex shrink-0 gap-2">
          {canManageBilling && (
            <Link href="/billing" className="btn-secondary">
              {t("ownerLink")}
            </Link>
          )}
          <button type="button" className="btn-secondary" onClick={() => setVisible(false)}>
            {tCommon("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
