"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { patchAuthConfig } from "@/lib/client/auth";
import { useSaveAction } from "@/lib/client/use-save-action";

/**
 * Nome mostrato della sezione Profilo (T-2802): si salva senza password; l'email ha la sua card (T-3002). Dopo il
 * salvataggio la pagina si aggiorna, così il menu dell'utente mostra il nome.
 */
export function ProfileCard({ initial }: { initial: { displayName: string } }) {
  const t = useTranslations("account.profile");
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const { saving, error, success, save } = useSaveAction();

  const saveName = () =>
    save(async (tErrors) => {
      const payload = await patchAuthConfig({ displayName }, tErrors);
      if (payload?.data?.displayName) {
        setDisplayName(payload.data.displayName);
      }
      router.refresh();
      return t("saved");
    });

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      error={error}
      success={success}
      save={{ onClick: saveName, pending: saving, label: t("save"), pendingLabel: t("saving") }}
    >
      <div>
        <label className="label" htmlFor="displayName">
          {t("displayName")}
        </label>
        <input
          id="displayName"
          className="input"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={t("displayNamePlaceholder")}
          autoComplete="nickname"
          maxLength={60}
        />
      </div>
    </SettingsCard>
  );
}
