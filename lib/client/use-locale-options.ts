import { useLocale } from "next-intl";
import { useMemo } from "react";
import { COUNTRY_CODES, LANGUAGE_CODES } from "@/lib/constants/locale-options";

export type LocaleOption = { code: string; label: string };

function displayNames(locale: string, type: "language" | "region"): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type });
  } catch {
    return null;
  }
}

/**
 * Opzioni di lingua e paese di estrazione con i nomi nella lingua dell'interfaccia (T-1302): «Inglese (en)» in
 * italiano, «English (en)» in inglese. Il codice resta tra parentesi; senza Intl.DisplayNames resta solo il codice.
 */
export function useLocaleOptions(): { languageOptions: LocaleOption[]; countryOptions: LocaleOption[] } {
  const locale = useLocale();

  return useMemo(() => {
    const languages = displayNames(locale, "language");
    const regions = displayNames(locale, "region");
    const capitalize = (name: string) => name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);

    return {
      languageOptions: LANGUAGE_CODES.map((code) => ({ code, label: `${capitalize(languages?.of(code) ?? code)} (${code})` })),
      countryOptions: COUNTRY_CODES.map((code) => ({ code, label: `${regions?.of(code) ?? code} (${code})` })),
    };
  }, [locale]);
}
