"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { type ApiErrorPayload, buildApiErrorMessage, readApiResponse, readJsonSafe, sendJson } from "@/lib/client/http";

type TopicSeedsDialogProps = {
  projectId: string;
  topicId: string;
  /** Parole di partenza attuali dell'argomento, nell'ordine salvato. */
  seeds: string[];
  /** Chiude il dialogo: chi lo apre lo smonta, così ogni apertura riparte dalle parole salvate. */
  onClose: () => void;
};

/** Parole di partenza da inviare: le rimaste, poi le aggiunte (una per riga), senza vuoti e senza doppioni. */
function nextSeeds(kept: string[], added: string): string[] {
  const lines = added.split("\n").map((line) => line.trim());
  return [...new Set([...kept, ...lines].filter(Boolean))];
}

/**
 * Dialogo «Parole di partenza» di un argomento (T-2404): le parole attuali con il pulsante per toglierle e un campo per
 * aggiungerne, una per riga, che riceve il focus all'apertura. «Salva» invia la lista completa con la PATCH
 * dell'argomento (T-809); «Salva e cerca» poi avvia la ricerca con la rotta run dello stesso argomento. Una ricerca già in
 * corso (409 JOB_ALREADY_ACTIVE) non è un errore; un altro blocco resta nel dialogo con il testo del catalogo.
 */
export function TopicSeedsDialog({ projectId, topicId, seeds, onClose }: TopicSeedsDialogProps) {
  const t = useTranslations("keywords.seeds");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const addId = useId();
  const [kept, setKept] = useState(seeds);
  const [added, setAdded] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicUrl = `/api/projects/${projectId}/subprojects/${topicId}`;

  const close = () => {
    if (!pending) {
      onClose();
    }
  };

  const save = async (search: boolean) => {
    setPending(true);
    setError(null);
    try {
      await readApiResponse(await sendJson("PATCH", topicUrl, { seeds: nextSeeds(kept, added) }), tErrors);
      if (search) {
        const run = await fetch(`${topicUrl}/run`, { method: "POST" });
        const payload = run.status === 202 ? null : await readJsonSafe<ApiErrorPayload>(run);
        if (run.status !== 202 && payload?.code !== "JOB_ALREADY_ACTIVE") {
          setError(buildApiErrorMessage(run, payload, tErrors));
          setPending(false);
          router.refresh();
          return;
        }
      }
      onClose();
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : tErrors("UNKNOWN", { status: 0 }));
      setPending(false);
    }
  };

  return (
    <ModalDialog title={t("title")} onClose={close}>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      <div className="space-y-2">
        <p className="label">{t("current")}</p>
        {kept.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {kept.map((seed) => (
              <li key={seed} className="keyword-seed">
                <span>{seed}</span>
                <button
                  type="button"
                  className="keyword-seed-remove"
                  aria-label={t("remove", { seed })}
                  onClick={() => setKept((current) => current.filter((item) => item !== seed))}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t("empty")}</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor={addId}>
          {t("addLabel")}
        </label>
        <textarea id={addId} className="input min-h-24" value={added} onChange={(event) => setAdded(event.target.value)} />
      </div>
      <DialogActions error={error} cancel={{ label: t("cancel"), onClick: close, disabled: pending }}>
        <button type="button" className="btn-secondary" onClick={() => save(false)} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </button>
        <button type="button" className="btn-primary" onClick={() => save(true)} disabled={pending}>
          {t("saveAndSearch")}
        </button>
      </DialogActions>
    </ModalDialog>
  );
}
