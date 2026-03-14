"use client";

import { useEffect, useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

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

export function PersonalizationSettingsCard({ initial }: { initial: PreferencesSnapshot }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(initial.themeMode);
  const [fontScaleMode, setFontScaleMode] = useState<FontScaleMode>(initial.fontScaleMode);
  const [colorVisionMode, setColorVisionMode] = useState<ColorVisionMode>(initial.colorVisionMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    applyPreferenceAttributes({ themeMode, fontScaleMode, colorVisionMode });
  }, [themeMode, fontScaleMode, colorVisionMode]);

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

      const payload = await readJsonSafe<PreferencesResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Impossibile salvare le preferenze"));
      }

      if (payload?.data) {
        setThemeMode(payload.data.themeMode);
        setFontScaleMode(payload.data.fontScaleMode);
        setColorVisionMode(payload.data.colorVisionMode);
        applyPreferenceAttributes(payload.data);
      }

      setSuccess("Preferenze salvate correttamente.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Accessibilita e tema</h2>
        <p className="text-sm text-slate-600">
          Personalizza l&apos;interfaccia con tema, leggibilita testo e modalita daltonismo.
        </p>
      </div>

      <div className="space-y-3">
        <p className="label mb-1">Tema</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={themeMode === "DARK" ? "btn-primary" : "btn-secondary"}
            onClick={() => setThemeMode("DARK")}
          >
            Scuro
          </button>
          <button
            type="button"
            className={themeMode === "LIGHT" ? "btn-primary" : "btn-secondary"}
            onClick={() => setThemeMode("LIGHT")}
          >
            Chiaro
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
          <span className="text-sm font-medium">Testo leggibilita aumentata (+14%)</span>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Aumenta dimensioni e interlinea di elementi principali per facilitare la lettura.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="colorVisionMode">
          Modalita daltonismo
        </label>
        <select
          id="colorVisionMode"
          className="select"
          value={colorVisionMode}
          onChange={(event) => setColorVisionMode(event.target.value as ColorVisionMode)}
        >
          <option value="NONE">Off</option>
          <option value="PROTANOPIA">Protanopia</option>
          <option value="DEUTERANOPIA">Deuteranopia</option>
          <option value="TRITANOPIA">Tritanopia</option>
        </select>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
        {saving ? "Salvataggio preferenze..." : "Salva preferenze"}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}