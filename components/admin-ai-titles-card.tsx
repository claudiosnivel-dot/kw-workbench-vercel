"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { type ErrorTranslator, readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

type AiTitlesView = {
  enabled: boolean;
  model: string;
  platformDailyLimit: number;
  workspaceDailyLimit: number;
  keyConfigured: boolean;
  used24h: number;
};

type AiTitlesInput = Pick<AiTitlesView, "enabled" | "model" | "platformDailyLimit" | "workspaceDailyLimit">;

/** PATCH delle impostazioni (T-3501): una risposta non riuscita lancia l'errore del catalogo. */
async function saveAiTitles(body: AiTitlesInput, tErrors: ErrorTranslator): Promise<{ data?: AiTitlesView } | null> {
  return readApiResponse(await sendJson("PATCH", "/api/admin/ai-titles", body), tErrors);
}

type LimitField = "platformDailyLimit" | "workspaceDailyLimit";
const LIMIT_FIELDS: LimitField[] = ["platformDailyLimit", "workspaceDailyLimit"];
const LIMIT_LABELS = { platformDailyLimit: "platformLimit", workspaceDailyLimit: "workspaceLimit" } as const;

/**
 * Titoli con l'AI nelle Impostazioni del root admin (T-3501, D-42): interruttore, modello gratuito, tetto della
 * piattaforma e limite per workspace, con lo stato della chiave (solo sì o no) e le proposte delle ultime 24 ore.
 * Il salvataggio manda i quattro valori; la rotta riverifica ruolo, modello e limiti.
 */
export function AiTitlesSettingsCard({ initial }: { initial: AiTitlesView }) {
  const t = useTranslations("admin.aiTitles");
  const [view, setView] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [model, setModel] = useState(initial.model);
  const [limits, setLimits] = useState<Record<LimitField, string>>({
    platformDailyLimit: String(initial.platformDailyLimit),
    workspaceDailyLimit: String(initial.workspaceDailyLimit),
  });
  const { saving, error, success, save } = useSaveAction();

  const submit = () =>
    save(async (tErrors) => {
      const payload = await saveAiTitles(
        {
          enabled,
          model,
          platformDailyLimit: Number(limits.platformDailyLimit),
          workspaceDailyLimit: Number(limits.workspaceDailyLimit),
        },
        tErrors
      );
      if (payload?.data) {
        setView(payload.data);
      }
      return t("saved");
    });

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      error={error}
      success={success}
      save={{ onClick: submit, pending: saving, label: t("save"), pendingLabel: t("saving") }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span id="ai-titles-enabled" className="text-sm font-medium">
          {t("enabled")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="ai-titles-enabled"
          className={enabled ? "btn-primary" : "btn-secondary"}
          disabled={saving}
          onClick={() => setEnabled((value) => !value)}
        >
          {enabled ? t("on") : t("off")}
        </button>
      </div>

      <div>
        <label className="label" htmlFor="ai-titles-model">
          {t("model")}
        </label>
        <input
          id="ai-titles-model"
          className="input"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          aria-describedby="ai-titles-model-hint"
          spellCheck={false}
        />
        <p id="ai-titles-model-hint" className="mt-1 text-xs text-slate-500">
          {t("modelHint")}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {LIMIT_FIELDS.map((field) => (
          <div key={field}>
            <label className="label" htmlFor={`ai-titles-${field}`}>
              {t(LIMIT_LABELS[field])}
            </label>
            <input
              id={`ai-titles-${field}`}
              className="input"
              type="number"
              min={1}
              max={1000}
              value={limits[field]}
              onChange={(event) => setLimits((current) => ({ ...current, [field]: event.target.value }))}
            />
          </div>
        ))}
      </div>

      <ul className="space-y-1 text-sm text-slate-600">
        <li>{t("keyConfigured", { configured: view.keyConfigured ? "yes" : "no" })}</li>
        <li>{t("used", { used: view.used24h, limit: view.platformDailyLimit })}</li>
      </ul>
    </SettingsCard>
  );
}
