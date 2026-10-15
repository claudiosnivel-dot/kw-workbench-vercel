"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { patchAuthConfig } from "@/lib/client/auth";
import { useSaveAction } from "@/lib/client/use-save-action";

/**
 * Sezione Profilo dell'account (T-2802): il nome mostrato si salva senza password; l'email resta in sola lettura (il
 * cambio arriva con il modulo 30). Dopo il salvataggio la pagina si aggiorna, così il menu dell'utente mostra il nome.
 */
export function ProfileCard({ initial }: { initial: { email: string | null; displayName: string } }) {
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
      {initial.email && (
        <p className="text-sm">
          <span className="font-medium">{t("email")}</span> {initial.email}
        </p>
      )}
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
