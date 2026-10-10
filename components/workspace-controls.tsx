"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmedActionButton } from "@/components/confirmed-action-button";
import { FormFeedback } from "@/components/form-feedback";
import { SettingsCard } from "@/components/settings-card";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";
import { useSaveAction } from "@/lib/client/use-save-action";

// Controlli della pagina /workspace (T-1504) sulle API di T-1503: la pagina li rende solo ai ruoli ammessi dalla
// tabella dei permessi, le rotte riverificano ruolo e membership a ogni richiesta.

/** Ruoli assegnabili da un invito o da un cambio di ruolo: la proprietà passa solo con il trasferimento. */
const ASSIGNABLE_ROLES = ["MEMBER", "ADMIN"] as const;

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function workspaceUrl(workspaceId: string, path = "") {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}${path}`;
}

function RoleOptions() {
  const t = useTranslations("workspace.roles");
  return ASSIGNABLE_ROLES.map((role) => (
    <option key={role} value={role}>
      {t(role)}
    </option>
  ));
}

/** Nome del workspace: modificabile solo con workspace.update; il campo resta visibile e disabilitato per gli altri. */
export function WorkspaceNameForm({ workspaceId, name, canEdit }: { workspaceId: string; name: string; canEdit: boolean }) {
  const t = useTranslations("workspace.name");
  const router = useRouter();
  const [value, setValue] = useState(name);
  const { saving, error, success, save } = useSaveAction();

  const rename = () =>
    save(async (tErrors) => {
      await readApiResponse(await sendJson("PATCH", workspaceUrl(workspaceId), { name: value }), tErrors);
      router.refresh();
      return t("saved");
    });

  return (
    <SettingsCard
      title={t("title")}
      error={error}
      success={success}
      save={canEdit ? { onClick: rename, pending: saving, label: t("save"), pendingLabel: t("saving") } : undefined}
    >
      <div>
        <label className="label" htmlFor="workspace-name">
          {t("label")}
        </label>
        <input
          id="workspace-name"
          className="input"
          maxLength={80}
          value={value}
          disabled={!canEdit}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </SettingsCard>
  );
}

/** Nuovo workspace di squadra (T-2008): diventa quello attivo, e con almeno due workspace la barra mostra il selettore. */
export function CreateWorkspaceForm() {
  const t = useTranslations("workspace.create");
  const router = useRouter();
  const [name, setName] = useState("");
  const { saving, error, success, save } = useSaveAction();

  const create = () =>
    save(async (tErrors) => {
      await readApiResponse(await sendJson("POST", "/api/workspaces", { name }), tErrors);
      setName("");
      router.refresh();
      return t("created");
    });

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      error={error}
      success={success}
      save={{ onClick: create, pending: saving, label: t("submit"), pendingLabel: t("submitting") }}
    >
      <div>
        <label className="label" htmlFor="new-workspace-name">
          {t("label")}
        </label>
        <input id="new-workspace-name" className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
    </SettingsCard>
  );
}

/** Ruolo di un membro, ADMIN o MEMBER: salvato alla scelta. */
export function MemberRoleSelect({
  workspaceId,
  userId,
  memberName,
  role,
}: {
  workspaceId: string;
  userId: string;
  memberName: string;
  role: AssignableRole;
}) {
  const t = useTranslations("workspace.members");
  const { loading, error, run } = useRefreshAction();

  return (
    <div className="space-y-1">
      <select
        className="select"
        aria-label={t("changeRole", { name: memberName })}
        value={role}
        disabled={loading}
        onChange={(event) =>
          void run(() => sendJson("PATCH", workspaceUrl(workspaceId, `/members/${encodeURIComponent(userId)}`), { role: event.target.value }))
        }
      >
        <RoleOptions />
      </select>
      <FormFeedback error={error} />
    </div>
  );
}

export function RemoveMemberButton({ workspaceId, userId, memberName }: { workspaceId: string; userId: string; memberName: string }) {
  const t = useTranslations("workspace.members");
  return (
    <ConfirmedActionButton
      className="btn-danger"
      confirmText={t("removeConfirm", { name: memberName })}
      label={t("remove")}
      pendingLabel={t("removing")}
      request={() => fetch(workspaceUrl(workspaceId, `/members/${encodeURIComponent(userId)}`), { method: "DELETE" })}
    />
  );
}

export function RevokeInviteButton({ workspaceId, inviteId, email }: { workspaceId: string; inviteId: string; email: string }) {
  const t = useTranslations("workspace.invites");
  return (
    <ConfirmedActionButton
      confirmText={t("revokeConfirm", { email })}
      label={t("revoke")}
      pendingLabel={t("revoking")}
      request={() => fetch(workspaceUrl(workspaceId, `/invites/${encodeURIComponent(inviteId)}`), { method: "DELETE" })}
    />
  );
}

/** Invito via email con ruolo ADMIN o MEMBER; la pagina si ricarica con il nuovo invito in attesa. */
export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("workspace.invites");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("MEMBER");
  const { saving, error, success, save } = useSaveAction();

  const send = () =>
    save(async (tErrors) => {
      await readApiResponse(await sendJson("POST", workspaceUrl(workspaceId, "/invites"), { email, role }), tErrors);
      setEmail("");
      router.refresh();
      return t("sent");
    });

  return (
    <SettingsCard
      title={t("formTitle")}
      intro={t("formIntro")}
      error={error}
      success={success}
      save={{ onClick: send, pending: saving, label: t("send"), pendingLabel: t("sending") }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="invite-email">
            {t("emailLabel")}
          </label>
          <input
            id="invite-email"
            className="input"
            type="email"
            autoComplete="off"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">
            {t("roleLabel")}
          </label>
          <select id="invite-role" className="select" value={role} onChange={(event) => setRole(event.target.value as AssignableRole)}>
            <RoleOptions />
          </select>
        </div>
      </div>
    </SettingsCard>
  );
}

/** Trasferimento della proprietà a un altro membro (solo OWNER). */
export function TransferOwnershipForm({ workspaceId, members }: { workspaceId: string; members: { id: string; name: string }[] }) {
  const t = useTranslations("workspace.transfer");
  const [target, setTarget] = useState(members[0]?.id ?? "");
  const targetName = members.find((member) => member.id === target)?.name ?? "";

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-slate-600">{t("intro")}</p>
      </div>
      <label className="label" htmlFor="transfer-target">
        {t("label")}
      </label>
      <select id="transfer-target" className="select" value={target} onChange={(event) => setTarget(event.target.value)}>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <ConfirmedActionButton
        confirmText={t("confirm", { name: targetName })}
        label={t("submit")}
        pendingLabel={t("submitting")}
        request={() => sendJson("POST", workspaceUrl(workspaceId, "/transfer"), { userId: target })}
      />
    </section>
  );
}

/** Abbandono del workspace: dopo l'uscita si torna alla dashboard, sul workspace personale. */
export function LeaveWorkspaceButton({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const t = useTranslations("workspace.leave");
  return (
    <ConfirmedActionButton
      className="btn-danger"
      confirmText={t("confirm", { name: workspaceName })}
      label={t("submit")}
      pendingLabel={t("submitting")}
      redirectTo="/"
      request={() => sendJson("POST", workspaceUrl(workspaceId, "/leave"), {})}
    />
  );
}
