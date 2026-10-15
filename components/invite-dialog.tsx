"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { FormFeedback } from "@/components/form-feedback";
import { ModalDialog } from "@/components/modal-dialog";
import { type AssignableRole, RoleOptions, workspaceUrl } from "@/components/workspace-controls";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";
import { formatDate } from "@/lib/view/format";

// Inviti della sezione Membri (T-3201, T-3202) sulle rotte di creazione e rinnovo: la pagina li rende solo a chi ha
// members.manage, le rotte riverificano il ruolo. Il link con il token arriva solo nella risposta e non si rilegge.

/** Invito appena creato o rinnovato, come lo restituiscono le rotte. */
type IssuedInvite = { email: string; expiresAt: string; inviteUrl: string; emailSent: boolean };

/** Richiesta che crea o rinnova un invito: in corso, errore dal catalogo (T-1303), invito ottenuto e pagina aggiornata. */
function useIssueInvite() {
  const router = useRouter();
  const { saving, error, save } = useSaveAction();
  const [issued, setIssued] = useState<IssuedInvite | null>(null);

  const issue = (request: () => Promise<Response>) =>
    save(async (tErrors) => {
      const payload = await readApiResponse<{ data: IssuedInvite }>(await request(), tErrors);
      setIssued(payload?.data ?? null);
      router.refresh();
      // La conferma è il link stesso: nessun messaggio a parte.
      return "";
    });

  return { pending: saving, error, issued, setIssued, issue };
}

/** Link da copiare (T-3201): campo di sola lettura con «Copia», «lo vedi solo adesso», scadenza ed email partita. */
function InviteLinkView({ invite, onClose }: { invite: IssuedInvite; onClose: () => void }) {
  const t = useTranslations("workspace.invites");
  const format = useFormatter();
  const linkId = useId();
  const linkRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  // Il modulo appena inviato sparisce: il focus passa al link, già selezionato per la copia a mano.
  useEffect(() => {
    linkRef.current?.focus();
    linkRef.current?.select();
  }, []);

  const copy = () => {
    void navigator.clipboard?.writeText(invite.inviteUrl).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  };

  return (
    <div className="space-y-3">
      <label htmlFor={linkId} className="label">
        {t("linkLabel", { email: invite.email })}
      </label>
      <div className="flex gap-2">
        <input ref={linkRef} id={linkId} className="input" readOnly value={invite.inviteUrl} />
        <button type="button" className="btn-secondary" onClick={copy}>
          {t("copy")}
        </button>
      </div>
      {copied && (
        <p className="text-sm text-green-700" role="status">
          {t("copied")}
        </p>
      )}
      <p className="text-sm text-slate-600">
        {t("onlyNow")} {t("validUntil", { date: formatDate(invite.expiresAt, format) })}
      </p>
      {invite.emailSent && <p className="text-sm text-slate-600">{t("emailSent")}</p>}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={onClose}>
          {t("done")}
        </button>
      </div>
    </div>
  );
}

/** Finestra «Invita una persona» (T-3201): email e ruolo, poi il link da copiare al posto del modulo. */
function InviteDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const t = useTranslations("workspace.invites");
  const { pending, error, issued, issue } = useIssueInvite();
  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("MEMBER");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void issue(() => sendJson("POST", workspaceUrl(workspaceId, "/invites"), { email, role }));
  };

  return (
    <ModalDialog title={t("formTitle")} onClose={onClose}>
      {issued ? (
        <InviteLinkView invite={issued} onClose={onClose} />
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <p className="text-sm text-slate-600">{t("formIntro")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={emailId}>
                {t("emailLabel")}
              </label>
              <input
                id={emailId}
                className="input"
                type="email"
                autoComplete="off"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={roleId}>
                {t("roleLabel")}
              </label>
              <select id={roleId} className="select" value={role} onChange={(event) => setRole(event.target.value as AssignableRole)}>
                <RoleOptions />
              </select>
            </div>
          </div>
          <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose, disabled: pending }}>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? t("sending") : t("send")}
            </button>
          </DialogActions>
        </form>
      )}
    </ModalDialog>
  );
}

/** Pulsante «Invita una persona» della sezione Membri: la finestra si monta a ogni apertura e riparte vuota. */
export function InviteButton({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("workspace.invites");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        {t("formTitle")}
      </button>
      {open && <InviteDialog workspaceId={workspaceId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** «Nuovo link» di un invito aperto, anche scaduto (T-3202): il nuovo link compare nella stessa vista della creazione. */
export function RenewInviteButton({ workspaceId, inviteId }: { workspaceId: string; inviteId: string }) {
  const t = useTranslations("workspace.invites");
  const { pending, error, issued, setIssued, issue } = useIssueInvite();
  const close = () => setIssued(null);

  const renew = () => {
    void issue(() => sendJson("POST", workspaceUrl(workspaceId, `/invites/${encodeURIComponent(inviteId)}/renew`), {}));
  };

  return (
    <div className="space-y-1">
      <button type="button" className="btn-secondary" onClick={renew} disabled={pending}>
        {pending ? t("renewing") : t("renew")}
      </button>
      <FormFeedback error={error} />
      {issued && (
        <ModalDialog title={t("renewTitle", { email: issued.email })} onClose={close}>
          <InviteLinkView invite={issued} onClose={close} />
        </ModalDialog>
      )}
    </div>
  );
}
