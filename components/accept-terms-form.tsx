"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TermsConsentCheckbox } from "@/components/terms-consent-checkbox";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

/** Riaccettazione dei termini cambiati (T-1405): poi si torna alla pagina richiesta, già ridotta da safeNextPath. */
export function AcceptTermsForm({ termsVersion, nextPath }: { termsVersion: string; nextPath: string }) {
  const t = useTranslations("auth.terms");
  const [accepted, setAccepted] = useState(false);
  const { pending, error, run } = useLeavingAction();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async (tErrors) => {
      await readApiResponse(await sendJson("POST", "/api/auth/accept-terms", { termsVersion }), tErrors);
      window.location.assign(nextPath);
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <TermsConsentCheckbox checked={accepted} onChange={setAccepted} />
      <SubmitButton pending={pending !== null} label={t("submit")} pendingLabel={t("submitting")} />
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
