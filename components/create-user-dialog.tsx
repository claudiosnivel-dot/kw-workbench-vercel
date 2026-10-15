"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useFormValues } from "@/lib/client/use-form-values";
import { usePendingAction } from "@/lib/client/use-pending-action";

type CreatableRole = "ADMIN" | "SUBSCRIBER";

const EMPTY_USER = { email: "", displayName: "", password: "", confirmPassword: "", role: "SUBSCRIBER" as CreatableRole };

/**
 * Finestra «Crea utente» (T-3303) con i campi e le regole di oggi (T-507): l'admin non root crea solo sottoscrittori, la
 * rotta riverifica ruolo e dati. Chi la apre la monta e la smonta, così ogni apertura riparte dai campi vuoti; dopo il 201
 * onCreated ricarica l'elenco e la finestra si chiude, un errore resta qui.
 */
export function CreateUserDialog({ isRootAdmin, onClose, onCreated }: { isRootAdmin: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const { pending, error, run } = usePendingAction();
  const { values, update } = useFormValues(EMPTY_USER);
  const id = useId();
  const roles: CreatableRole[] = isRootAdmin ? ["ADMIN", "SUBSCRIBER"] : ["SUBSCRIBER"];

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await readApiResponse(await sendJson("POST", "/api/admin/users", values), tErrors);
      onCreated();
      onClose();
    });
  };

  return (
    <ModalDialog title={t("create.title")} onClose={onClose}>
      <form className="space-y-4" onSubmit={create}>
        {!isRootAdmin && <p className="text-sm text-slate-600">{t("create.nonRootHint")}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${id}-email`}>
              {tAuth("email")}
            </label>
            <input
              id={`${id}-email`}
              className="input"
              type="email"
              autoComplete="off"
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-name`}>
              {tAuth("displayName")}
            </label>
            <input
              id={`${id}-name`}
              className="input"
              maxLength={60}
              value={values.displayName}
              onChange={(event) => update("displayName", event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-role`}>
              {t("create.role")}
            </label>
            <select
              id={`${id}-role`}
              className="select"
              value={values.role}
              onChange={(event) => update("role", event.target.value as CreatableRole)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${id}-password`}>
              {tAuth("password")}
            </label>
            <input
              id={`${id}-password`}
              className="input"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => update("password", event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-confirm`}>
              {tAuth("confirmPassword")}
            </label>
            <input
              id={`${id}-confirm`}
              className="input"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) => update("confirmPassword", event.target.value)}
            />
          </div>
        </div>
        <DialogActions error={error} cancel={{ label: t("create.cancel"), onClick: onClose, disabled: pending }}>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? t("create.creating") : t("create.submit")}
          </button>
        </DialogActions>
      </form>
    </ModalDialog>
  );
}
