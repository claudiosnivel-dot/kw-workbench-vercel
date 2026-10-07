"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { isSupportedLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";

/** Selettore della lingua (T-1301): salva la scelta con POST /api/locale e ricarica i dati della pagina. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common.locale");
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function changeLocale(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isSupportedLocale(next) || next === locale) return;

    setSaving(true);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      aria-label={t("label")}
      value={locale}
      onChange={changeLocale}
      disabled={saving}
      className={["select locale-switcher", className].filter(Boolean).join(" ")}
    >
      {SUPPORTED_LOCALES.map((option) => (
        <option key={option} value={option}>
          {t(option)}
        </option>
      ))}
    </select>
  );
}
