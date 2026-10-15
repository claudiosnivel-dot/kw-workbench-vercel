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

// Controlli delle sezioni Generale e Membri del workspace (T-1504, T-3101) sulle API di T-1503: le pagine li rendono
// solo ai ruoli ammessi dalla tabella dei permessi, le rotte riverificano ruolo e membership a ogni richiesta.

/** Ruoli assegnabili da un invito o da un cambio di ruolo: la proprietà passa solo con il trasferimento. */
const ASSIGNABLE_ROLES = ["MEMBER", "ADMIN"] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function workspaceUrl(workspaceId: string, path = "") {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}${path}`;
}

export function RoleOptions() {
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

/** Trasferimento della proprietà a un altro membro (solo OWNER), dentro «Azioni irreversibili» (T-3101). */
export function TransferOwnershipForm({ workspaceId, members }: { workspaceId: string; members: { id: string; name: string }[] }) {
  const t = useTranslations("workspace.transfer");
  const [target, setTarget] = useState(members[0]?.id ?? "");
  const targetName = members.find((member) => member.id === target)?.name ?? "";

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">{t("title")}</h3>
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
    </div>
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
