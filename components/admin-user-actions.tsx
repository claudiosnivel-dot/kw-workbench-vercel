"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { DialogActions } from "@/components/dialog-actions";
import { FormFeedback } from "@/components/form-feedback";
import { ModalDialog } from "@/components/modal-dialog";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { usePendingAction } from "@/lib/client/use-pending-action";
import { useSaveAction } from "@/lib/client/use-save-action";

type UserRole = "ADMIN" | "SUBSCRIBER";
type UserStatus = "ACTIVE" | "SUSPENDED";

export type ManagedUser = { id: string; displayName: string; email: string | null; role: UserRole; status: UserStatus };

const ROLES: UserRole[] = ["ADMIN", "SUBSCRIBER"];

function userEndpoint(userId: string) {
  return `/api/admin/users/${userId}`;
}

/**
 * Finestra «Cambia email» del root admin (T-3402): la rotta riverifica il ruolo, normalizza l'indirizzo e applica la
 * regola di verifica del lancio. Dopo il salvataggio la scheda si ricarica con la nuova email.
 */
function ChangeEmailDialog({ user, onClose, onChanged }: { user: ManagedUser; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("admin.user.email");
  const tErrors = useTranslations("errors");
  const { pending, error, run } = usePendingAction();
  const [email, setEmail] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await readApiResponse(await sendJson("PATCH", userEndpoint(user.id), { email }), tErrors);
      onChanged();
      onClose();
    });
  };

  return (
    <ModalDialog title={t("title", { name: user.displayName })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="label">{t("label")}</span>
          <input className="input" type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <p className="text-sm text-slate-600">{t("hint")}</p>
        <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose, disabled: pending }}>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? t("saving") : t("submit")}
          </button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}

/**
 * Azioni della scheda dell'utente (T-3401) con le rotte e le regole di oggi (T-507, T-1704): ruolo (solo root admin),
 * sospensione o riattivazione, password reimpostata e «Cambia email» (solo root admin, T-3402). La scheda la rende solo
 * per gli utenti che l'admin può gestire; le rotte riverificano.
 */
export function AdminUserActions({ user, viewerIsRoot }: { user: ManagedUser; viewerIsRoot: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const { saving, error, success, setSuccess, save } = useSaveAction();
  const [role, setRole] = useState<UserRole>(user.role);
  const [password, setPassword] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);

  const patch = (body: Record<string, string>, after?: () => void) =>
    save(async (tErrors) => {
      await readApiResponse(await sendJson("PATCH", userEndpoint(user.id), body), tErrors);
      after?.();
      router.refresh();
      return t("user.actions.updated");
    });

  const resetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void patch({ newPassword: password, confirmPassword: password }, () => setPassword(""));
  };

  const onEmailChanged = () => {
    setSuccess(t("user.email.changed"));
    router.refresh();
  };

  return (
    <section className="card space-y-4">
      <CardIntro title={t("user.actions.title")} intro={t("user.actions.intro")} />
      <div className="flex flex-wrap items-end gap-3">
        {viewerIsRoot && (
          <>
            <label className="space-y-1">
              <span className="label">{t("user.actions.role")}</span>
              <select className="select" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {t(`roles.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondary" disabled={saving || role === user.role} onClick={() => void patch({ role })}>
              {t("user.actions.saveRole")}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => void patch({ status: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}
        >
          {user.status === "ACTIVE" ? t("user.actions.suspend") : t("user.actions.reactivate")}
        </button>
        {viewerIsRoot && (
          <button type="button" className="btn-secondary" onClick={() => setEmailOpen(true)}>
            {t("user.actions.changeEmail")}
          </button>
        )}
      </div>
      <form onSubmit={resetPassword} className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="label">{t("user.actions.newPassword")}</span>
          <input
            className="input min-w-[220px]"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={saving || !password}>
          {t("user.actions.resetPassword")}
        </button>
      </form>
      <FormFeedback error={error} success={success} />
      {emailOpen && <ChangeEmailDialog user={user} onClose={() => setEmailOpen(false)} onChanged={onEmailChanged} />}
    </section>
  );
}

/** Elimina della zona rossa della scheda (T-2006, T-3401): dopo la conferma l'admin torna all'elenco degli utenti. */
export function AdminUserDeleteButton({ user }: { user: ManagedUser }) {
  const t = useTranslations("admin.user.danger");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { pending, error, run } = usePendingAction();

  const remove = () => {
    if (!window.confirm(t("confirm", { name: user.email ?? user.displayName }))) {
      return;
    }
    void run(async () => {
      await readApiResponse(await sendJson("DELETE", userEndpoint(user.id), {}), tErrors);
      router.push("/admin/users");
    });
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-danger" disabled={pending} onClick={remove}>
        {pending ? tCommon("deleting") : t("delete")}
      </button>
      <FormFeedback error={error} />
    </div>
  );
}
