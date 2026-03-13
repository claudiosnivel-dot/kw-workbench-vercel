import { deleteSettingValue, getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";

const KEYS = {
  appName: "APP_BRAND_NAME",
  logoUrl: "APP_BRAND_LOGO_URL",
} as const;

const FALLBACK_APP_NAME = "Seo God Mode";

export type BrandingSnapshot = {
  appName: string;
  logoUrl: string;
};

function clean(value: string | null | undefined): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeAppName(value: string | null | undefined): string {
  const normalized = clean(value);
  if (!normalized) {
    return FALLBACK_APP_NAME;
  }

  return normalized.slice(0, 80);
}

function normalizeLogoUrl(value: string | null | undefined): string | undefined {
  const normalized = clean(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("data:image/")) {
    return normalized;
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function getBrandingSnapshot(): Promise<BrandingSnapshot> {
  try {
    const values = await getManySettingValues(Object.values(KEYS));

    return {
      appName: normalizeAppName(values[KEYS.appName] ?? process.env.APP_BRAND_NAME),
      logoUrl: normalizeLogoUrl(values[KEYS.logoUrl] ?? process.env.APP_BRAND_LOGO_URL) ?? "",
    };
  } catch {
    return {
      appName: normalizeAppName(process.env.APP_BRAND_NAME),
      logoUrl: normalizeLogoUrl(process.env.APP_BRAND_LOGO_URL) ?? "",
    };
  }
}

export async function updateBrandingSettings(input: {
  appName?: string;
  logoUrl?: string | null;
}): Promise<BrandingSnapshot> {
  const writes: Promise<unknown>[] = [];

  if (typeof input.appName === "string") {
    const normalizedName = clean(input.appName);

    if (!normalizedName) {
      writes.push(deleteSettingValue(KEYS.appName));
    } else {
      writes.push(
        upsertSettingValue({
          key: KEYS.appName,
          value: normalizedName.slice(0, 80),
          isSecret: false,
        })
      );
    }
  }

  if (input.logoUrl !== undefined) {
    const rawLogoValue = clean(input.logoUrl ?? "");

    if (!rawLogoValue) {
      writes.push(deleteSettingValue(KEYS.logoUrl));
    } else {
      const normalizedLogoUrl = normalizeLogoUrl(rawLogoValue);
      if (!normalizedLogoUrl) {
        throw new Error("Logo non valido. Inserisci un URL http/https, un percorso locale (/logo.svg) o un data URL immagine.");
      }

      writes.push(
        upsertSettingValue({
          key: KEYS.logoUrl,
          value: normalizedLogoUrl,
          isSecret: false,
        })
      );
    }
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }

  return getBrandingSnapshot();
}