"use client";

import { useTranslations } from "next-intl";
import { FormFeedback } from "@/components/form-feedback";
import { readApiResponse } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

/** Avviso per l'utente con email non verificata (T-1403), con il nuovo invio dell'email di verifica. */
export function EmailVerificationBanner() {
  const t = useTranslations("auth.verifyBanner");
  const { saving, error, success, save } = useSaveAction();

  const resend = () =>
    save(async (tErrors) => {
      await readApiResponse(await fetch("/api/auth/verify-email/resend", { method: "POST" }), tErrors);
      return t("sent");
    });

  return (
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("text")}</p>
        <button className="btn-secondary shrink-0" type="button" onClick={resend} disabled={saving}>
          {saving ? t("resending") : t("resend")}
        </button>
      </div>
      <FormFeedback error={error} success={success} />
    </div>
  );
}
