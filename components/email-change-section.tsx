"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { SettingsCard } from "@/components/settings-card";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

/** Richiesta di cambio in attesa (T-3002): nuovo indirizzo e scadenza del link in ISO 8601. */
export type PendingEmailChangeView = { newEmail: string; expiresAt: string };

type EmailChangeSectionProps = {
  email: string | null;
  pending: PendingEmailChangeView | null;
  /** false finché le email non partono (D-11): il cambio lo fa l'amministratore. */
  emailDeliveryAvailable: boolean;
};

const ENDPOINT = "/api/account/email";

/**
 * Finestra «Cambia email» (T-3002): nuova email e password attuale; dopo il 202 passa la richiesta alla sezione e si
 * chiude. Gli errori restano nella finestra, in un elemento role alert.
 */
function EmailChangeDialog({ onClose, onSent }: { onClose: () => void; onSent: (pending: PendingEmailChangeView) => void }) {
  const t = useTranslations("account.email");
  const emailId = useId();
  const passwordId = useId();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const { saving, error, save } = useSaveAction();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(async (tErrors) => {
      const payload = await readApiResponse<{ data?: PendingEmailChangeView }>(
        await sendJson("POST", ENDPOINT, { newEmail, currentPassword }),
        tErrors
      );
      if (payload?.data) {
        onSent(payload.data);
      }
      return "";
    });
  };

  return (
    <ModalDialog title={t("change")} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-600">{t("dialogIntro")}</p>
        <div>
          <label className="label" htmlFor={emailId}>
            {t("newEmail")}
          </label>
          <input
            id={emailId}
            className="input"
            type="email"
            autoComplete="email"
            value={newEmail}
            required
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor={passwordId}>
            {t("currentPassword")}
          </label>
          <input
            id={passwordId}
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            required
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <DialogActions error={error} cancel={{ label: t("close"), onClick: onClose, disabled: saving }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? t("submitting") : t("submit")}
          </button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}

/**
 * Email del Profilo (T-3002): l'indirizzo attuale e «Cambia email», oppure la richiesta «In attesa di conferma» con la
 * scadenza e «Annulla». Senza invio delle email il pulsante è spento e una riga rimanda all'amministratore.
 */
export function EmailChangeSection({ email, pending: initialPending, emailDeliveryAvailable }: EmailChangeSectionProps) {
  const t = useTranslations("account.email");
  const format = useFormatter();
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { saving, error, save } = useSaveAction();

  const sent = (request: PendingEmailChangeView) => {
    setPending(request);
    setDialogOpen(false);
    router.refresh();
  };

  const cancel = () =>
    save(async (tErrors) => {
      await readApiResponse(await sendJson("DELETE", ENDPOINT, {}), tErrors);
      setPending(null);
      router.refresh();
      return "";
    });

  return (
    <SettingsCard title={t("title")} intro={t("intro")}>
      {email && (
        <p className="text-sm">
          <span className="font-medium">{t("current")}</span> {email}
        </p>
      )}
      {pending ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("pending", { email: pending.newEmail })}</p>
          <p className="text-sm text-slate-600">
            {t("expires", { date: format.dateTime(new Date(pending.expiresAt), { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
          <button type="button" className="btn-secondary" onClick={() => void cancel()} disabled={saving}>
            {t("cancel")}
          </button>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setDialogOpen(true)} disabled={!emailDeliveryAvailable}>
          {t("change")}
        </button>
      )}
      {!emailDeliveryAvailable && !pending && <p className="text-sm text-slate-600">{t("unavailable")}</p>}
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {dialogOpen && <EmailChangeDialog onClose={() => setDialogOpen(false)} onSent={sent} />}
    </SettingsCard>
  );
}
