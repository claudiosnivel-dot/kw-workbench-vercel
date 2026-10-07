"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { ApiErrorPayload, readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

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
  const [themeMode, setThemeMode] = useState<ThemeMode>(initial.themeMode);
  const [fontScaleMode, setFontScaleMode] = useState<FontScaleMode>(initial.fontScaleMode);
  const [colorVisionMode, setColorVisionMode] = useState<ColorVisionMode>(initial.colorVisionMode);
  const { saving, error, success, save } = useSaveAction();
  // Preferenze salvate: l'anteprima non salvata non sopravvive all'uscita dalla pagina (T-1104).
  const saved = useRef<PreferencesSnapshot>(initial);

  useEffect(() => {
    applyPreferenceAttributes({ themeMode, fontScaleMode, colorVisionMode });
  }, [themeMode, fontScaleMode, colorVisionMode]);

  useEffect(() => {
    const savedPreferences = saved;
    return () => applyPreferenceAttributes(savedPreferences.current);
  }, []);

  const savePreferences = () =>
    save(async (tErrors) => {
      const response = await sendJson("PATCH", "/api/user/preferences", { themeMode, fontScaleMode, colorVisionMode });
      const payload = await readApiResponse<PreferencesResponse>(response, tErrors);
      if (payload?.data) {
        saved.current = payload.data;
        setThemeMode(payload.data.themeMode);
        setFontScaleMode(payload.data.fontScaleMode);
        setColorVisionMode(payload.data.colorVisionMode);
        applyPreferenceAttributes(payload.data);
      }
      return t("saved");
    });

  return (
    <SettingsCard
      title={t("title")}
      intro={t("intro")}
      className="space-y-5"
      error={error}
      success={success}
      save={{ onClick: savePreferences, pending: saving, label: t("save"), pendingLabel: t("saving") }}
    >

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
    </SettingsCard>
  );
}