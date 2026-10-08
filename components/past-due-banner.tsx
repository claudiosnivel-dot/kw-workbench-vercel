"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { formatDate } from "@/lib/view/format";

/**
 * Pagamento scaduto del workspace corrente (T-1604): data di fine della tolleranza per tutti i membri, link al metodo di
 * pagamento (pagina di fatturazione) solo per l'OWNER.
 */
export function PastDueBanner({ graceEndsAt, canManageBilling }: { graceEndsAt: string; canManageBilling: boolean }) {
  const t = useTranslations("billing.pastDue");
  const format = useFormatter();
  return (
    <div role="status" data-testid="billing-past-due-banner" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("banner", { date: formatDate(graceEndsAt, format) })}</p>
        {canManageBilling && (
          <Link href="/billing" className="btn-secondary shrink-0">
            {t("update")}
          </Link>
        )}
      </div>
    </div>
  );
}
