"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";
import { isSupportedLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";

type ThemeMode = "DARK" | "LIGHT";
type FontScaleMode = "NORMAL" | "LARGE";
type ColorVisionMode = "NONE" | "PROTANOPIA" | "DEUTERANOPIA" | "TRITANOPIA";

type PreferencesSnapshot = {
  themeMode: ThemeMode;
  fontScaleMode: FontScaleMode;
  colorVisionMode: ColorVisionMode;
};

function applyPreferenceAttributes(input: PreferencesSnapshot) {
  const html = document.documentElement;
  html.setAttribute("data-theme", input.themeMode);
  html.setAttribute("data-font-scale", input.fontScaleMode);
  html.setAttribute("data-color-vision", input.colorVisionMode);
}

const COLOR_VISION_MODES: ColorVisionMode[] = ["NONE", "PROTANOPIA", "DEUTERANOPIA", "TRITANOPIA"];

/**
 * Preferenze dell'account (T-1104, T-2901): ogni scelta si salva subito, senza pulsante Salva; con un errore la scelta
 * torna al valore precedente. La lingua usa la stessa richiesta del selettore del menu (T-1301).
 */
export function PersonalizationSettingsCard({ initial }: { initial: PreferencesSnapshot }) {
  const t = useTranslations("settings.preferences");
  const tLocale = useTranslations("common.locale");
  const router = useRouter();
  const [preferences, setPreferences] = useState<PreferencesSnapshot>(initial);
  const currentLocale = useLocale();
  const [locale, setLocale] = useState(currentLocale);
  const { saving, error, success, save } = useSaveAction();

  useEffect(() => {
    applyPreferenceAttributes(preferences);
  }, [preferences]);

  const persist = (request: () => Promise<Response>, revert: () => void) =>
    save(async (tErrors) => {
      try {
        await readApiResponse(await request(), tErrors);
      } catch (saveError) {
        revert();
        throw saveError;
      }
      router.refresh();
      return t("saved");
    });

  function choose<K extends keyof PreferencesSnapshot>(field: K, value: PreferencesSnapshot[K]) {
    if (preferences[field] === value) return;
    const previous = preferences;
    setPreferences({ ...previous, [field]: value });
    void persist(() => sendJson("PATCH", "/api/user/preferences", { [field]: value }), () => setPreferences(previous));
  }

  function chooseLocale(next: string) {
    if (!isSupportedLocale(next) || next === locale) return;
    const previous = locale;
    setLocale(next);
    void persist(() => sendJson("POST", "/api/locale", { locale: next }), () => setLocale(previous));
  }

  return (
    <SettingsCard title={t("title")} intro={t("intro")} className="space-y-5">
      <div>
        <label className="label" htmlFor="uiLocale">
          {tLocale("label")}
        </label>
        <select
          id="uiLocale"
          className="select"
          value={locale}
          disabled={saving}
          onChange={(event) => chooseLocale(event.target.value)}
        >
          {SUPPORTED_LOCALES.map((option) => (
            <option key={option} value={option}>
              {tLocale(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <p className="label mb-1">{t("theme")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={preferences.themeMode === "DARK" ? "btn-primary" : "btn-secondary"}
            disabled={saving}
            onClick={() => choose("themeMode", "DARK")}
          >
            {t("dark")}
          </button>
          <button
            type="button"
            className={preferences.themeMode === "LIGHT" ? "btn-primary" : "btn-secondary"}
            disabled={saving}
            onClick={() => choose("themeMode", "LIGHT")}
          >
            {t("light")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="inline-flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={preferences.fontScaleMode === "LARGE"}
            disabled={saving}
            onChange={(event) => choose("fontScaleMode", event.target.checked ? "LARGE" : "NORMAL")}
          />
          <span className="text-sm font-medium">{t("largeText")}</span>
        </label>
        <p className="mt-2 text-xs text-slate-500">{t("largeTextHint")}</p>
      </div>

      <div>
        <label className="label" htmlFor="colorVisionMode">
          {t("colorVision")}
        </label>
        <select
          id="colorVisionMode"
          className="select"
          value={preferences.colorVisionMode}
          disabled={saving}
          onChange={(event) => choose("colorVisionMode", event.target.value as ColorVisionMode)}
        >
          {COLOR_VISION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`colorVisionOptions.${mode}`)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {/* Testo letto a ogni render: dopo il cambio di lingua «Salvato» compare nella lingua nuova. */}
      {success && (
        <p className="text-sm text-green-700" role="status">
          {t("saved")}
        </p>
      )}
    </SettingsCard>
  );
}
