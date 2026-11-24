"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AgentActivityList } from "@/components/admin-agent-activity";
import { AgentKeyConfirmDialog } from "@/components/admin-agent-key-dialog";
import { AgentSpendCapField } from "@/components/admin-agent-spend-cap";
import { SettingsCard } from "@/components/settings-card";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";
import {
  AGENT_KEY_DURATIONS,
  type AgentCallView,
  type AgentKeyDuration,
  type AgentKeyStatus,
  type AgentSpend,
  type CreatedAgentKey,
  DEFAULT_AGENT_KEY_DURATION,
} from "@/lib/modules/agent/key-types";
import { formatDate } from "@/lib/view/format";

const ENDPOINT = "/api/admin/agent-key";

/** Chiave appena creata e comando per collegare Claude Code: esistono solo nello stato del componente (CWE-312). */
type IssuedKey = { key: string; command: string };

/** Comando di collegamento con l'origine dell'app (APP_PUBLIC_URL, altrimenti quella della pagina). */
function connectCommand(origin: string, key: string): string {
  return `claude mcp add --transport http titanseo ${origin}/api/mcp --header "Authorization: Bearer ${key}"`;
}

/** Valore da copiare con «Copia» e la conferma «Copiato». */
function CopyField({ label, copyLabel, value, multiline }: { label: string; copyLabel: string; value: string; multiline?: boolean }) {
  const t = useTranslations("admin.agentKey");
  const id = useId();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  };

  return (
    <div className="space-y-2">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="input agent-key-value" readOnly rows={4} value={value} />
      ) : (
        <input id={id} className="input agent-key-value" readOnly value={value} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" aria-label={copyLabel} onClick={copy}>
          {t("copy")}
        </button>
        {copied && (
          <span className="text-sm text-green-700" role="status">
            {t("copied")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Prefisso, creazione, scadenza («Mai») e ultimo uso («Mai usata») della chiave attiva; mai la chiave. */
function KeyStatusList({ status }: { status: AgentKeyStatus }) {
  const t = useTranslations("admin.agentKey");
  const format = useFormatter();

  return (
    <ul className="space-y-1 text-sm" data-testid="agent-key-status">
      <li className="font-medium">{t("prefix", { prefix: status.prefix })}</li>
      <li>{t("created", { date: formatDate(status.createdAt, format) })}</li>
      <li>{status.expiresAt ? t("expires", { date: formatDate(status.expiresAt, format) }) : t("neverExpires")}</li>
      <li>{status.lastUsedAt ? t("lastUsed", { date: formatDate(status.lastUsedAt, format) }) : t("neverUsed")}</li>
    </ul>
  );
}

/**
 * Card «Claude Code» delle impostazioni dell'amministrazione (T-7102), solo per il root admin: stato della chiave, durata
 * (90 giorni preselezionati), creazione e revoca. La chiave nuova e il comando si vedono una volta, solo nello stato del
 * componente: mai in un URL né nello storage del browser; ricaricando resta il prefisso. La rotta riverifica il ruolo.
 * In fondo il tetto giornaliero di spesa di Claude Code con la spesa di oggi (T-7302) e l'attività di Claude Code con
 * le ultime chiamate (T-7602), che dopo il salvataggio del tetto mostra quello nuovo.
 */
export function AdminAgentKeyCard({
  initial,
  origin,
  spend: initialSpend,
  calls = [],
}: {
  initial: AgentKeyStatus | null;
  origin: string | null;
  spend: AgentSpend;
  calls?: AgentCallView[];
}) {
  const t = useTranslations("admin.agentKey");
  const [spend, setSpend] = useState(initialSpend);
  const durationId = useId();
  const { saving, error, setError, save } = useSaveAction();
  const [status, setStatus] = useState(initial);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [duration, setDuration] = useState<AgentKeyDuration>(DEFAULT_AGENT_KEY_DURATION);
  const [dialog, setDialog] = useState<"replace" | "revoke" | null>(null);
  const active = status?.active ? status : null;

  const create = () =>
    save(async (tErrors) => {
      const payload = await readApiResponse<{ data: CreatedAgentKey }>(await sendJson("POST", ENDPOINT, { duration }), tErrors);
      if (payload) {
        setStatus(payload.data.status);
        setIssued({ key: payload.data.key, command: connectCommand(origin ?? window.location.origin, payload.data.key) });
      }
      setDialog(null);
      return "";
    });

  const revoke = () =>
    save(async (tErrors) => {
      const payload = await readApiResponse<{ data: AgentKeyStatus | null }>(await fetch(ENDPOINT, { method: "DELETE" }), tErrors);
      setStatus(payload?.data ?? null);
      setIssued(null);
      setDialog(null);
      return "";
    });

  const openDialog = (kind: "replace" | "revoke") => {
    setError(null);
    setDialog(kind);
  };

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      className="agent-key-card space-y-4"
      error={dialog ? null : error}
    >
      <div data-testid="admin-agent-key-card" className="space-y-4">
        {issued && (
          <div className="space-y-3">
            <CopyField label={t("keyLabel")} copyLabel={t("copyKey")} value={issued.key} />
            <CopyField label={t("commandLabel")} copyLabel={t("copyCommand")} value={issued.command} multiline />
            {/* Dove incollare il comando (T-8303): la chiave non deve restare scritta in una conversazione (CWE-312). */}
            <p className="text-sm">{t("pasteInTerminal")}</p>
            <p className="text-sm">{t.rich("removeOld", { code: (chunks) => <code className="agent-key-value">{chunks}</code> })}</p>
            <p className="text-sm font-medium">{t("onlyNow")}</p>
          </div>
        )}

        {active ? <KeyStatusList status={active} /> : <p className="text-sm font-medium">{t("none")}</p>}

        <div>
          <label className="label" htmlFor={durationId}>
            {t("duration")}
          </label>
          <select
            id={durationId}
            className="select"
            value={String(duration)}
            onChange={(event) => setDuration(AGENT_KEY_DURATIONS.find((option) => String(option) === event.target.value) ?? DEFAULT_AGENT_KEY_DURATION)}
          >
            {AGENT_KEY_DURATIONS.map((option) => (
              <option key={option} value={String(option)}>
                {t(`durations.${option}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {active ? (
            <>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => openDialog("replace")}>
                {t("createNew")}
              </button>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => openDialog("revoke")}>
                {t("revoke")}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void create()}>
              {saving ? t("creating") : t("create")}
            </button>
          )}
        </div>

        <AgentSpendCapField initial={initialSpend} onSaved={setSpend} />

        <AgentActivityList calls={calls} spend={spend} />
      </div>

      {dialog && active && (
        <AgentKeyConfirmDialog
          kind={dialog}
          prefix={active.prefix}
          pending={saving}
          error={error}
          onConfirm={() => void (dialog === "replace" ? create() : revoke())}
          onClose={() => setDialog(null)}
        />
      )}
    </SettingsCard>
  );
}
