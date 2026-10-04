"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type BrandingSnapshot = {
  appName: string;
  logoUrl: string;
  logoUrlDark: string;
  logoUrlLight: string;
};

type BrandingResponse = ApiErrorPayload & {
  data?: BrandingSnapshot;
};

const MAX_LOGO_SIZE_BYTES = 350 * 1024;

type LogoTarget = "dark" | "light";

export function BrandingSettingsCard({ initial }: { initial: BrandingSnapshot }) {
  const router = useRouter();

  const [appName, setAppName] = useState(initial.appName);
  const [logoUrlDark, setLogoUrlDark] = useState(initial.logoUrlDark);
  const [logoUrlLight, setLogoUrlLight] = useState(initial.logoUrlLight);
  const [legacyLogoUrl, setLegacyLogoUrl] = useState(initial.logoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveName = useMemo(() => {
    const normalized = appName.trim();
    return normalized || "Seo God Mode";
  }, [appName]);

  const previewDarkLogo = logoUrlDark || logoUrlLight || legacyLogoUrl;
  const previewLightLogo = logoUrlLight || logoUrlDark || legacyLogoUrl;

  const onFileSelect = (target: LogoTarget) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setSuccess(null);

    if (!file.type.startsWith("image/")) {
      setError("File non supportato. Carica un'immagine (PNG, JPG, SVG, WEBP).");
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError("Logo troppo grande. Usa un file massimo da 350KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("Impossibile leggere il file selezionato.");
        return;
      }

      if (target === "dark") {
        setLogoUrlDark(reader.result);
        setSuccess("Logo dark caricato localmente. Premi Salva branding per applicarlo.");
      } else {
        setLogoUrlLight(reader.result);
        setSuccess("Logo light caricato localmente. Premi Salva branding per applicarlo.");
      }
    };
    reader.onerror = () => setError("Impossibile leggere il file selezionato.");
    reader.readAsDataURL(file);

    event.target.value = "";
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          logoUrlDark,
          logoUrlLight,
        }),
      });

      const payload = await readJsonSafe<BrandingResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Impossibile salvare il branding"));
      }

      const snapshot = payload?.data;
      if (snapshot) {
        setAppName(snapshot.appName);
        setLogoUrlDark(snapshot.logoUrlDark);
        setLogoUrlLight(snapshot.logoUrlLight);
        setLegacyLogoUrl(snapshot.logoUrl);
      }

      setSuccess("Branding salvato con successo.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  const clearThemeLogo = (target: LogoTarget) => {
    if (target === "dark") {
      setLogoUrlDark("");
      setSuccess("Logo dark rimosso localmente. Premi Salva branding per confermare.");
    } else {
      setLogoUrlLight("");
      setSuccess("Logo light rimosso localmente. Premi Salva branding per confermare.");
    }

    setError(null);
  };

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Branding</h2>
        <p className="mt-1 text-sm text-slate-600">
          Configura loghi dedicati per tema scuro e chiaro. In navbar viene usato il logo del tema corrente con fallback automatico.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="appName">
              Nome applicazione
            </label>
            <input
              id="appName"
              className="input"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder="Seo God Mode"
              maxLength={80}
            />
          </div>

          <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-sm font-semibold">Logo tema scuro</h3>
            <input
              id="logoUrlDark"
              className="input"
              value={logoUrlDark}
              onChange={(event) => setLogoUrlDark(event.target.value)}
              placeholder="https://miosito.it/logo-dark.svg"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="btn-secondary w-full cursor-pointer text-center sm:w-auto">
                Carica logo dark
                <input type="file" accept="image/*" className="hidden" onChange={onFileSelect("dark")} />
              </label>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => clearThemeLogo("dark")}>
                Rimuovi logo dark
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-sm font-semibold">Logo tema chiaro</h3>
            <input
              id="logoUrlLight"
              className="input"
              value={logoUrlLight}
              onChange={(event) => setLogoUrlLight(event.target.value)}
              placeholder="https://miosito.it/logo-light.svg"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="btn-secondary w-full cursor-pointer text-center sm:w-auto">
                Carica logo light
                <input type="file" accept="image/*" className="hidden" onChange={onFileSelect("light")} />
              </label>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => clearThemeLogo("light")}>
                Rimuovi logo light
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Formati supportati: URL `https://`, percorso `/logo.svg` o immagine caricata. Logo legacy tecnico: {legacyLogoUrl ? "presente" : "assente"}.
          </p>

          <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
            {saving ? "Salvataggio branding..." : "Salva branding"}
          </button>
        </div>

        <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Anteprima navbar</p>

          <div className="rounded-2xl border border-white/10 bg-[#020617] px-4 py-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Tema scuro</p>
            {previewDarkLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewDarkLogo} alt={`${effectiveName} dark`} className="h-11 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-sm text-slate-400">Nessun logo disponibile</span>
            )}
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Tema chiaro</p>
            {previewLightLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewLightLogo} alt={`${effectiveName} light`} className="h-11 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-sm text-slate-500">Nessun logo disponibile</span>
            )}
          </div>

          <p className="text-xs text-slate-500">Fallback automatico: logo tema corrente -&gt; altro logo -&gt; logo legacy.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}