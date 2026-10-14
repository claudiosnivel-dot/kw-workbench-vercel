"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { overridesPayload, overrideValuesOf, type TopicOverrides, TopicOverrideFields } from "@/components/subproject-form";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useFormValues } from "@/lib/client/use-form-values";
import { usePendingAction } from "@/lib/client/use-pending-action";

type TopicOverridesDialogProps = {
  projectId: string;
  topic: { id: string; name: string };
  overrides: TopicOverrides;
  /** Root admin: sceglie la fonte dei suggerimenti e DataForSEO (D-24, T-902). */
  canEditAutocompleteProvider: boolean;
  onClose: () => void;
};

/**
 * Dialogo «Impostazioni diverse dal progetto…» dal menu ⋯ dell'argomento (T-2602): gli stessi campi delle Avanzate con
 * «Come il progetto» come scelta predefinita; Salva invia gli override con la PATCH esistente dell'argomento (T-809).
 */
export function TopicOverridesDialog({ projectId, topic, overrides, canEditAutocompleteProvider, onClose }: TopicOverridesDialogProps) {
  const t = useTranslations("keywords.overrides");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { values, update } = useFormValues(() => overrideValuesOf(overrides));
  const { pending, error, run } = usePendingAction();
  const close = pending ? () => undefined : onClose;

  const save = () =>
    run(async () => {
      const body = overridesPayload(values, canEditAutocompleteProvider);
      await readApiResponse(await sendJson("PATCH", `/api/projects/${projectId}/subprojects/${topic.id}`, body), tErrors);
      onClose();
      router.refresh();
    });

  return (
    <ModalDialog title={t("title")} onClose={close}>
      <p className="text-sm text-slate-600">{t("intro", { name: topic.name })}</p>
      <TopicOverrideFields
        values={values}
        update={update}
        canEditAutocompleteProvider={canEditAutocompleteProvider}
        showLicensedProvider={canEditAutocompleteProvider || overrides.metrics_provider_override === "DATAFORSEO"}
      />
      <DialogActions error={error} cancel={{ label: t("cancel"), onClick: close, disabled: pending }}>
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </button>
      </DialogActions>
    </ModalDialog>
  );
}
