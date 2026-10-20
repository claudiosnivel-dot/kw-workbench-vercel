"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useArticleRequests } from "@/components/article/article-request";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { PUBLISHED_URL_MAX_LENGTH } from "@/lib/modules/strategy/types";

type ArticlePublishDialogProps = {
  /** Indirizzo dell'API della pagina del piano (PATCH di T-1904, T-2501). */
  pageApiUrl: string;
  /** Version del piano letta dall'editor (CWE-362). */
  version: number;
  /** Indirizzo già salvato, altrimenti il sito più lo slug, altrimenti vuoto. */
  initialUrl: string;
  onSaved: (saved: { version: number; publishedUrl: string }) => void;
  onClose: () => void;
};

/**
 * Finestra «Segna come pubblicata» (T-4502): l'indirizzo della pagina sul sito (https assoluto, fino a 500 caratteri)
 * va con status PUBLISHED nella PATCH della pagina del piano; un indirizzo non valido o un piano cambiato nel frattempo
 * restano nella finestra con il testo del catalogo. La stessa finestra cambia l'indirizzo in seguito.
 */
export function ArticlePublishDialog({ pageApiUrl, version, initialUrl, onSaved, onClose }: ArticlePublishDialogProps) {
  const t = useTranslations("article.export.publish");
  const requests = useArticleRequests();
  const fieldId = useId();
  const [value, setValue] = useState(initialUrl);
  // Richiesta in corso ed errore dell'ultima: il salvataggio riuscito chiude la finestra.
  const [request, setRequest] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });
  const { pending, error } = request;

  const submit = async () => {
    const publishedUrl = value.trim();
    setRequest({ pending: true, error: null });
    const result = await requests.send<{ version: number }>(pageApiUrl, { method: "PATCH", body: { version, status: "PUBLISHED", publishedUrl } });
    if (result.ok) {
      onSaved({ version: result.data.version, publishedUrl });
      return;
    }
    setRequest({
      pending: false,
      error: result.code === "VALIDATION_ERROR" ? t("invalid") : result.code === "STRATEGY_CONFLICT" ? t("conflict") : result.message,
    });
  };

  return (
    <ModalDialog title={t("title")} onClose={onClose}>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      <div className="space-y-1">
        <label className="label" htmlFor={fieldId}>
          {t("url")}
        </label>
        <input
          id={fieldId}
          className="input"
          type="url"
          inputMode="url"
          maxLength={PUBLISHED_URL_MAX_LENGTH}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <p className="text-xs text-slate-500">{t("hint")}</p>
      </div>
      <DialogActions error={error} cancel={{ label: t("cancel"), onClick: onClose, disabled: pending }}>
        <button type="button" className="btn-primary" disabled={pending || !value.trim()} onClick={() => void submit()}>
          {pending ? t("saving") : t("submit")}
        </button>
      </DialogActions>
    </ModalDialog>
  );
}
