"use client";

import { useTranslations } from "next-intl";
import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CardIntro } from "@/components/card-intro";
import { FormFeedback } from "@/components/form-feedback";
import { ApiErrorPayload, messageOf, readApiResponse } from "@/lib/client/http";

type BrandingSnapshot = {
  appName: string;
  logoUrl: string;
  logoUrlDark: string;
  logoUrlLight: string;
};

type BrandingResponse = ApiErrorPayload & {
  data?: BrandingSnapshot;
};

// Allineati al server (T-506): al massimo 100 KB e solo i tipi ammessi per i logo inline.
const MAX_LOGO_SIZE_BYTES = 100 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const LOGO_ACCEPT = ALLOWED_LOGO_TYPES.join(",");

type LogoTarget = "dark" | "light";

export function BrandingSettingsCard({ initial, canEdit }: { initial: BrandingSnapshot; canEdit: boolean }) {
  const t = useTranslations("settings.branding");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
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

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError(t("fileUnsupported"));
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError(t("tooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError(t("readFailed"));
        return;
      }

      if (target === "dark") {
        setLogoUrlDark(reader.result);
        setSuccess(t("darkLoaded"));
      } else {
        setLogoUrlLight(reader.result);
        setSuccess(t("lightLoaded"));
      }
    };
    reader.onerror = () => setError(t("readFailed"));
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

      const payload = await readApiResponse<BrandingResponse>(response, tErrors);

      const snapshot = payload?.data;
      if (snapshot) {
        setAppName(snapshot.appName);
        setLogoUrlDark(snapshot.logoUrlDark);
        setLogoUrlLight(snapshot.logoUrlLight);
        setLegacyLogoUrl(snapshot.logoUrl);
      }

      setSuccess(t("saved"));
      router.refresh();
    } catch (saveError) {
      setError(messageOf(saveError, tCommon("unexpectedError")));
    } finally {
      setSaving(false);
    }
  };

  const clearThemeLogo = (target: LogoTarget) => {
    if (target === "dark") {
      setLogoUrlDark("");
      setSuccess(t("darkRemoved"));
    } else {
      setLogoUrlLight("");
      setSuccess(t("lightRemoved"));
    }

    setError(null);
  };

  return (
    <section className="card space-y-5">
      <CardIntro title={t("title")} intro={t("intro")} />

      {!canEdit && (
        <p className="text-sm text-slate-600">{t("readOnly")}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <fieldset className="min-w-0 space-y-5" disabled={!canEdit}>
          <div>
            <label className="label" htmlFor="appName">
              {t("appName")}
            </label>
            <input
              id="appName"
              className="input"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder={t("appNamePlaceholder")}
              maxLength={80}
            />
          </div>

          <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-sm font-semibold">{t("darkLogo")}</h3>
            <input
              id="logoUrlDark"
              className="input"
              value={logoUrlDark}
              onChange={(event) => setLogoUrlDark(event.target.value)}
              placeholder={t("darkPlaceholder")}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="btn-secondary w-full cursor-pointer text-center sm:w-auto">
                {t("uploadDark")}
                <input type="file" accept={LOGO_ACCEPT} className="hidden" onChange={onFileSelect("dark")} />
              </label>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => clearThemeLogo("dark")}>
                {t("removeDark")}
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <h3 className="text-sm font-semibold">{t("lightLogo")}</h3>
            <input
              id="logoUrlLight"
              className="input"
              value={logoUrlLight}
              onChange={(event) => setLogoUrlLight(event.target.value)}
              placeholder={t("lightPlaceholder")}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="btn-secondary w-full cursor-pointer text-center sm:w-auto">
                {t("uploadLight")}
                <input type="file" accept={LOGO_ACCEPT} className="hidden" onChange={onFileSelect("light")} />
              </label>
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => clearThemeLogo("light")}>
                {t("removeLight")}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">{t("formats", { legacy: legacyLogoUrl ? "present" : "absent" })}</p>

          <button className="btn-primary w-full sm:w-auto" type="button" onClick={save} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </button>
        </fieldset>

        <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t("preview")}</p>

          <div className="rounded-2xl border border-white/10 bg-[#020617] px-4 py-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t("darkTheme")}</p>
            {previewDarkLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewDarkLogo} alt={t("previewAltDark", { name: effectiveName })} className="h-11 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-sm text-slate-400">{t("noLogo")}</span>
            )}
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("lightTheme")}</p>
            {previewLightLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewLightLogo} alt={t("previewAltLight", { name: effectiveName })} className="h-11 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-sm text-slate-500">{t("noLogo")}</span>
            )}
          </div>

          <p className="text-xs text-slate-500">{t("fallbackHint")}</p>
        </div>
      </div>

      <FormFeedback error={error} success={success} />
    </section>
  );
}