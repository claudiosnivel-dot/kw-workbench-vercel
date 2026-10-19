"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { usePreferencePost } from "@/lib/client/use-preference-post";
import { isOfferedLocale, OFFERED_LOCALES, type OfferedLocale } from "@/lib/i18n/locale";

/**
 * Selettore della lingua (T-1301): le lingue offerte (T-4701, T-4902). Con alternates (pagine pubbliche, URL per lingua,
 * D-28 emendata) porta alla stessa pagina nella lingua scelta; altrimenti la salva con POST /api/locale e ricarica i dati.
 */
export function LocaleSwitcher({ className, alternates }: { className?: string; alternates?: Record<OfferedLocale, string> }) {
  const t = useTranslations("common.locale");
  const locale = useLocale();
  const router = useRouter();
  const { saving, save } = usePreferencePost();

  async function changeLocale(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isOfferedLocale(next) || next === locale) return;
    if (alternates) {
      router.push(alternates[next]);
      return;
    }
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
        <option key={option} value={option} lang={option}>
          {t(option)}
        </option>
      ))}
    </select>
  );
}
