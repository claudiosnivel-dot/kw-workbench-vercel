import { deleteSettingValue, getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";

const KEYS = {
  appName: "APP_BRAND_NAME",
  logoUrl: "APP_BRAND_LOGO_URL",
  logoUrlDark: "APP_BRAND_LOGO_URL_DARK",
  logoUrlLight: "APP_BRAND_LOGO_URL_LIGHT",
} as const;

const FALLBACK_APP_NAME = "Seo God Mode";

export type BrandingSnapshot = {
  appName: string;
  logoUrl: string;
  logoUrlDark: string;
  logoUrlLight: string;
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
      logoUrlDark: normalizeLogoUrl(values[KEYS.logoUrlDark] ?? process.env.APP_BRAND_LOGO_URL_DARK) ?? "",
      logoUrlLight: normalizeLogoUrl(values[KEYS.logoUrlLight] ?? process.env.APP_BRAND_LOGO_URL_LIGHT) ?? "",
    };
  } catch {
    return {
      appName: normalizeAppName(process.env.APP_BRAND_NAME),
      logoUrl: normalizeLogoUrl(process.env.APP_BRAND_LOGO_URL) ?? "",
      logoUrlDark: normalizeLogoUrl(process.env.APP_BRAND_LOGO_URL_DARK) ?? "",
      logoUrlLight: normalizeLogoUrl(process.env.APP_BRAND_LOGO_URL_LIGHT) ?? "",
    };
  }
}

function buildLogoWrite(key: string, value: string | null | undefined): Promise<unknown> {
  const rawLogoValue = clean(value ?? "");

  if (!rawLogoValue) {
    return deleteSettingValue(key);
  }

  const normalizedLogoUrl = normalizeLogoUrl(rawLogoValue);
  if (!normalizedLogoUrl) {
    throw new Error("Logo non valido. Inserisci un URL http/https, un percorso locale (/logo.svg) o un data URL immagine.");
  }

  return upsertSettingValue({
    key,
    value: normalizedLogoUrl,
    isSecret: false,
  });
}

export async function updateBrandingSettings(input: {
  appName?: string;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  logoUrlLight?: string | null;
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
    writes.push(buildLogoWrite(KEYS.logoUrl, input.logoUrl));
  }

  if (input.logoUrlDark !== undefined) {
    writes.push(buildLogoWrite(KEYS.logoUrlDark, input.logoUrlDark));
  }

  if (input.logoUrlLight !== undefined) {
    writes.push(buildLogoWrite(KEYS.logoUrlLight, input.logoUrlLight));
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }

  return getBrandingSnapshot();
}