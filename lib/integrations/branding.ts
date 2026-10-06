import { revalidateTag, unstable_cache } from "next/cache";
import { ValidationError } from "@/lib/http/errors";
import { deleteSettingValue, getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";

const KEYS = {
  appName: "APP_BRAND_NAME",
  logoUrl: "APP_BRAND_LOGO_URL",
  logoUrlDark: "APP_BRAND_LOGO_URL_DARK",
  logoUrlLight: "APP_BRAND_LOGO_URL_LIGHT",
} as const;

const FALLBACK_APP_NAME = "Seo God Mode";
const MAX_APP_NAME_LENGTH = 80;
const MAX_LOGO_URL_LENGTH = 2048;
// Il logo inline finisce nell'HTML di ogni pagina (TopNav nel layout): al massimo 100 KB decodificati.
const MAX_INLINE_LOGO_BYTES = 102400;
const INLINE_LOGO_PATTERN = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]*={0,2})$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

type LogoField = "logoUrl" | "logoUrlDark" | "logoUrlLight";

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
  if (!normalized || normalized.length > MAX_APP_NAME_LENGTH || CONTROL_CHARACTERS.test(normalized)) {
    return FALLBACK_APP_NAME;
  }

  return normalized;
}

function decodedBase64Length(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Logo ammesso o null: URL assoluti https con host, percorsi locali «/x» senza backslash (mai «//» né «/\»),
 * data URL base64 png, jpeg, webp o svg fino a 100 KB decodificati. Rifiuta http:, javascript: e altri data:.
 */
function normalizeLogoUrl(value: string | null | undefined): string | undefined {
  const normalized = clean(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("data:")) {
    const match = INLINE_LOGO_PATTERN.exec(normalized);
    return match && decodedBase64Length(match[1]) <= MAX_INLINE_LOGO_BYTES ? normalized : undefined;
  }

  if (normalized.length > MAX_LOGO_URL_LENGTH) {
    return undefined;
  }

  if (normalized.startsWith("/")) {
    return /^\/[^/\\]/.test(normalized) && !normalized.includes("\\") ? normalized : undefined;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "https:" && parsed.hostname) {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/** Tag della cache dati di Next con le righe del branding: lo invalida updateBrandingSettings (T-1105). */
const BRANDING_CACHE_TAG = "branding";

function brandingFrom(values: Record<string, string>): BrandingSnapshot {
  // I valori salvati non conformi (es. http: di prima di T-506) si ignorano: nome e logo predefiniti.
  return {
    appName: normalizeAppName(values[KEYS.appName] ?? process.env.APP_BRAND_NAME),
    logoUrl: normalizeLogoUrl(values[KEYS.logoUrl] ?? process.env.APP_BRAND_LOGO_URL) ?? "",
    logoUrlDark: normalizeLogoUrl(values[KEYS.logoUrlDark] ?? process.env.APP_BRAND_LOGO_URL_DARK) ?? "",
    logoUrlLight: normalizeLogoUrl(values[KEYS.logoUrlLight] ?? process.env.APP_BRAND_LOGO_URL_LIGHT) ?? "",
  };
}

function readBrandingValues(): Promise<Record<string, string>> {
  return getManySettingValues(Object.values(KEYS));
}

// Solo le righe pubbliche del branding (nome e logo) entrano nella cache condivisa; un errore del DB non si
// mette in cache e la richiesta usa i valori d'ambiente.
const readCachedBrandingValues = unstable_cache(readBrandingValues, ["branding-values"], {
  tags: [BRANDING_CACHE_TAG],
});

export async function getBrandingSnapshot(): Promise<BrandingSnapshot> {
  try {
    return brandingFrom(await readCachedBrandingValues());
  } catch {
    return brandingFrom({});
  }
}

/** Valore da salvare per un campo (null = chiave da cancellare); ValidationError con il nome del campo. */
function validatedAppName(value: string): string | null {
  const normalized = clean(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_APP_NAME_LENGTH || CONTROL_CHARACTERS.test(normalized)) {
    throw new ValidationError(
      `appName non valido: usa da 1 a ${MAX_APP_NAME_LENGTH} caratteri senza caratteri di controllo.`
    );
  }

  return normalized;
}

function validatedLogo(field: LogoField, value: string | null): string | null {
  if (!clean(value)) {
    return null;
  }

  const normalized = normalizeLogoUrl(value);
  if (!normalized) {
    throw new ValidationError(
      `${field} non valido: usa un URL https, un percorso locale (/logo.svg) o un'immagine png, jpeg, webp o svg fino a 100 KB.`
    );
  }

  return normalized;
}

export async function updateBrandingSettings(input: {
  appName?: string;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  logoUrlLight?: string | null;
}): Promise<BrandingSnapshot> {
  // Prima si valida tutto, poi si scrive in un'unica transazione: un campo invalido non lascia stati parziali.
  const changes = new Map<string, string | null>();

  if (typeof input.appName === "string") {
    changes.set(KEYS.appName, validatedAppName(input.appName));
  }

  for (const field of ["logoUrl", "logoUrlDark", "logoUrlLight"] as const) {
    if (input[field] !== undefined) {
      changes.set(KEYS[field], validatedLogo(field, input[field]));
    }
  }

  if (changes.size > 0) {
    await prisma.$transaction(
      [...changes].map(([key, value]) =>
        value === null ? deleteSettingValue(key) : upsertSettingValue({ key, value, isSecret: false })
      )
    );
    // expire 0: nessuna richiesta successiva riceve il branding precedente (niente stale-while-revalidate).
    revalidateTag(BRANDING_CACHE_TAG, { expire: 0 });
  }

  // Lettura diretta: nella stessa richiesta la cache può non vedere ancora l'invalidazione.
  return brandingFrom(await readBrandingValues());
}
