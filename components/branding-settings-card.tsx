"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

type BrandingSnapshot = {
  appName: string;
  logoUrl: string;
};

type BrandingResponse = ApiErrorPayload & {
  data?: BrandingSnapshot;
};

const MAX_LOGO_SIZE_BYTES = 350 * 1024;

export function BrandingSettingsCard({ initial }: { initial: BrandingSnapshot }) {
  const router = useRouter();

  const [appName, setAppName] = useState(initial.appName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const effectiveName = useMemo(() => {
    const normalized = appName.trim();
    return normalized || "Seo God Mode";
  }, [appName]);

  const onFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setSuccess(null);

    if (!file.type.startsWith("image/")) {
      setError("File non supportato. Carica un'immagine (PNG, JPG, SVG, WEBP). ");
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError("Logo troppo grande. Usa un file massimo da 350KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoUrl(reader.result);
        setSuccess("Logo caricato localmente. Premi Salva branding per applicarlo.");
      } else {
        setError("Impossibile leggere il file selezionato.");
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
          logoUrl,
        }),
      });

      const payload = await readJsonSafe<BrandingResponse>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Impossibile salvare il branding"));
      }

      const snapshot = payload?.data;
      if (snapshot) {
        setAppName(snapshot.appName);
        setLogoUrl(snapshot.logoUrl);
      }

      setSuccess("Branding salvato con successo.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  };

  const clearLogo = () => {
    setLogoUrl("");
    setSuccess("Logo rimosso localmente. Premi Salva branding per confermare.");
    setError(null);
  };

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Branding</h2>
        <p className="mt-1 text-sm text-slate-600">
          Personalizza nome e logo visibili nell'header dell'app. Il logo puo essere un URL pubblico o un'immagine caricata.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4">
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

          <div>
            <label className="label" htmlFor="logoUrl">
              URL logo
            </label>
            <input
              id="logoUrl"
              className="input"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://miosito.it/logo.svg"
            />
            <p className="mt-1 text-xs text-slate-500">Accettati: URL `https://`, percorso `/logo.svg` o immagine caricata.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="btn-secondary w-full cursor-pointer text-center sm:w-auto">
              Carica logo
              <input type="file" accept="image/*" className="hidden" onChange={onFileSelect} />
            </label>
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearLogo}>
              Rimuovi logo
            </button>
          </div>

          <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
            {saving ? "Salvataggio branding..." : "Salva branding"}
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Anteprima header</p>
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-[var(--surface-border)]">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 ring-1 ring-[var(--surface-border)]">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Anteprima logo" className="h-full w-full object-contain" />
              ) : (
                effectiveName.slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="text-sm font-semibold tracking-tight">{effectiveName}</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </section>
  );
}