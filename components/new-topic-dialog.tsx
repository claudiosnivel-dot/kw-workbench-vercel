"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { ModalDialog } from "@/components/modal-dialog";
import { type ApiErrorPayload, buildApiErrorMessage, readJsonSafe, sendJson } from "@/lib/client/http";
import { useOpenTopic } from "@/lib/client/use-open-topic";
import { isApiErrorCode } from "@/lib/http/error-codes";

type NewTopicDialogProps = {
  projectId: string;
  /** Chiude il dialogo: chi lo apre lo smonta, così ogni apertura riparte da un modulo vuoto. */
  onClose: () => void;
};

// Limite del nome di una sezione (T-809, D-24): il nome dell'argomento è la prima parola di partenza.
const TOPIC_NAME_MAX_LENGTH = 120;
// 409 del nome già usato nel progetto (lib/modules/sections.ts): il dialogo lo dice con la parola «argomento».
const NAME_TAKEN_CODE = "SECTION_NAME_TAKEN";

/**
 * Dialogo «Nuovo argomento» (T-2303): una domanda, le parole di partenza aggiuntive a richiesta. «Trova le keyword»
 * crea l'argomento con nome uguale alla prima parola e tutte le parole come seed (POST subprojects, T-808), avvia la
 * ricerca (rotta run dell'argomento) e porta ai risultati del nuovo argomento; se la ricerca non parte, i risultati
 * mostrano il motivo. Un nome già usato nel progetto mostra un messaggio sotto il campo e non crea nulla.
 */
export function NewTopicDialog({ projectId, onClose }: NewTopicDialogProps) {
  const t = useTranslations("project.shell.newTopic");
  const tErrors = useTranslations("errors");
  const openTopic = useOpenTopic();
  const fieldId = useId();
  const errorId = useId();
  const [topic, setTopic] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [more, setMore] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (!pending) {
      onClose();
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = topic.trim();
    if (!name) {
      setError(t("required"));
      return;
    }
    const seeds = [name, ...more.split("\n").map((line) => line.trim())].filter(Boolean);

    setPending(true);
    setError(null);
    try {
      const created = await sendJson("POST", `/api/projects/${projectId}/subprojects`, { name, seeds });
      const payload = await readJsonSafe<ApiErrorPayload & { data?: { id: string } }>(created);
      if (!created.ok || !payload?.data) {
        setError(payload?.code === NAME_TAKEN_CODE ? t("nameTaken") : buildApiErrorMessage(created, payload, tErrors));
        setPending(false);
        return;
      }

      const topicId = payload.data.id;
      const run = await fetch(`/api/projects/${projectId}/subprojects/${topicId}/run`, { method: "POST" });
      // 409 JOB_ALREADY_ACTIVE: la ricerca dell'argomento è già in corso, nessun messaggio.
      const runCode = run.status === 202 ? null : (await readJsonSafe<ApiErrorPayload>(run))?.code;
      onClose();
      openTopic(projectId, topicId, runCode !== "JOB_ALREADY_ACTIVE" && isApiErrorCode(runCode) ? runCode : null);
    } catch {
      setError(tErrors("UNKNOWN", { status: 0 }));
      setPending(false);
    }
  };

  return (
    <ModalDialog title={t("title")} onClose={close}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <div>
          <label className="label" htmlFor={fieldId}>
            {t("fieldLabel")}
          </label>
          <input
            id={fieldId}
            className="input"
            value={topic}
            maxLength={TOPIC_NAME_MAX_LENGTH}
            placeholder={t("placeholder")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setTopic(event.target.value)}
          />
          {error && (
            <p id={errorId} className="mt-1 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">{t("hint")}</p>
        </div>

        {showMore ? (
          <label className="block">
            <span className="label">{t("moreLabel")}</span>
            <textarea className="input min-h-24" value={more} onChange={(event) => setMore(event.target.value)} />
          </label>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline"
            onClick={() => setShowMore(true)}
          >
            {t("more")}
          </button>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={close} disabled={pending}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
