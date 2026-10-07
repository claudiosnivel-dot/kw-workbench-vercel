"use client";

import { useTranslations } from "next-intl";
import { useLocaleOptions } from "@/lib/client/use-locale-options";
import { isSupportedCountryCode, isSupportedLanguageCode } from "@/lib/constants/locale-options";

/**
 * Opzioni di lingua o paese di estrazione per un select (T-1303): nomi nella lingua dell'interfaccia; un codice
 * salvato fuori elenco resta selezionabile come «codice attuale non standard».
 */
export function LocaleCodeOptions({ kind, current }: { kind: "language" | "country"; current: string }) {
  const t = useTranslations("projects.fields");
  const { languageOptions, countryOptions } = useLocaleOptions();
  const options = kind === "language" ? languageOptions : countryOptions;
  const supported = kind === "language" ? isSupportedLanguageCode : isSupportedCountryCode;

  return (
    <>
      {current && !supported(current) && <option value={current}>{t("customCode", { code: current })}</option>}
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </>
  );
}
