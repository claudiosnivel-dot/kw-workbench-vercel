"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { ApiErrorPayload, readApiResponse } from "@/lib/client/http";

type ThemeMode = "DARK" | "LIGHT";
type FontScaleMode = "NORMAL" | "LARGE";
type ColorVisionMode = "NONE" | "PROTANOPIA" | "DEUTERANOPIA" | "TRITANOPIA";

type PreferencesSnapshot = {
  themeMode: ThemeMode;
  fontScaleMode: FontScaleMode;
  colorVisionMode: ColorVisionMode;
};

type PreferencesResponse = ApiErrorPayload & {
  data?: PreferencesSnapshot;
};

function applyPreferenceAttributes(input: PreferencesSnapshot) {
  const html = document.documentElement;
  html.setAttribute("data-theme", input.themeMode);
  html.setAttribute("data-font-scale", input.fontScaleMode);
  html.setAttribute("data-color-vision", input.colorVisionMode);
}

const COLOR_VISION_MODES: ColorVisionMode[] = ["NONE", "PROTANOPIA", "DEUTERANOPIA", "TRITANOPIA"];

export function PersonalizationSettingsCard({ initial }: { initial: PreferencesSnapshot }) {
  const t = useTranslations("settings.preferences");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [themeMode, setThemeMode] = useState<ThemeMode>(initial.themeMode);
  const [fontScaleMode, setFontScaleMode] = useState<FontScaleMode>(initial.fontScaleMode);
  const [colorVisionMode, setColorVisionMode] = useState<ColorVisionMode>(initial.colorVisionMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Preferenze salvate: l'anteprima non salvata non sopravvive all'uscita dalla pagina (T-1104).
  const saved = useRef<PreferencesSnapshot>(initial);

  useEffect(() => {
    applyPreferenceAttributes({ themeMode, fontScaleMode, colorVisionMode });
  }, [themeMode, fontScaleMode, colorVisionMode]);

  useEffect(() => {
    const savedPreferences = saved;
    return () => applyPreferenceAttributes(savedPreferences.current);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeMode,
          fontScaleMode,
          colorVisionMode,
        }),
      });

      const payload = await readApiResponse<PreferencesResponse>(response, tErrors);

      if (payload?.data) {
        saved.current = payload.data;
        setThemeMode(payload.data.themeMode);
        setFontScaleMode(payload.data.fontScaleMode);
        setColorVisionMode(payload.data.colorVisionMode);
        applyPreferenceAttributes(payload.data);
      }

      setSuccess(t("saved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : tCommon("unexpectedError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-5">
      <CardIntro title={t("title")} intro={t("intro")} />

      <div className="space-y-3">
        <p className="label mb-1">{t("theme")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={themeMode === "DARK" ? "btn-primary" : "btn-secondary"}
            onClick={() => setThemeMode("DARK")}
          >
            {t("dark")}
          </button>
          <button
            type="button"
            className={themeMode === "LIGHT" ? "btn-primary" : "btn-secondary"}
            onClick={() => setThemeMode("LIGHT")}
          >
            {t("light")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="inline-flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={fontScaleMode === "LARGE"}
            onChange={(event) => setFontScaleMode(event.target.checked ? "LARGE" : "NORMAL")}
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
          value={colorVisionMode}
          onChange={(event) => setColorVisionMode(event.target.value as ColorVisionMode)}
        >
          {COLOR_VISION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`colorVisionOptions.${mode}`)}
            </option>
          ))}
        </select>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? t("saving") : t("save")}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}