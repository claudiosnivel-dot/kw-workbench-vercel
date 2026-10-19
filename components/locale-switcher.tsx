"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { usePreferencePost } from "@/lib/client/use-preference-post";
import { isOfferedLocale, OFFERED_LOCALES } from "@/lib/i18n/locale";

/** Selettore della lingua (T-1301): le lingue offerte (T-4701), salvate con POST /api/locale; ricarica i dati della pagina. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common.locale");
  const locale = useLocale();
  const { saving, save } = usePreferencePost();

  async function changeLocale(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isOfferedLocale(next) || next === locale) return;
    await save("/api/locale", { locale: next });
  }

  return (
    <select
      aria-label={t("label")}
      value={locale}
      onChange={changeLocale}
      disabled={saving}
      className={["select locale-switcher", className].filter(Boolean).join(" ")}
    >
      {OFFERED_LOCALES.map((option) => (
        <option key={option} value={option}>
          {t(option)}
        </option>
      ))}
    </select>
  );
}
