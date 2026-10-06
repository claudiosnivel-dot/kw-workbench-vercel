import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/http/errors";
import { deleteSettingValue, getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";

const KEYS = {
  clientId: "GOOGLE_SHEETS_OAUTH_CLIENT_ID",
  clientSecret: "GOOGLE_SHEETS_OAUTH_CLIENT_SECRET",
  redirectUri: "GOOGLE_SHEETS_OAUTH_REDIRECT_URI",
} as const;

export type GoogleSheetsApiConfig = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
};

export type ConfigSource = "db" | "env" | "none";

type Field = keyof typeof KEYS;

const FIELDS = Object.keys(KEYS) as Field[];

export type GoogleSheetsApiConfigSnapshot = {
  clientId: string;
  redirectUri: string;
  /** Del client secret solo la presenza e la fonte, mai il valore (CWE-200). */
  hasClientSecret: boolean;
  sources: Record<Field, ConfigSource>;
};

/** null = rimuove l'override salvato e torna al valore d'ambiente; assente o stringa vuota = invariato. */
export type GoogleSheetsApiConfigPatch = Partial<Record<Field, string | null>>;

const CALLBACK_PATH = "/api/integrations/google-sheets/callback";
const CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";

function clean(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

/** Valore effettivo di ogni campo e la sua fonte: l'override in DB vince sull'ambiente. */
async function resolveConfig(): Promise<{ values: GoogleSheetsApiConfig; sources: Record<Field, ConfigSource> }> {
  const dbValues = await getManySettingValues(Object.values(KEYS));
  const values: GoogleSheetsApiConfig = {};
  const sources = {} as Record<Field, ConfigSource>;

  for (const field of FIELDS) {
    const fromDb = clean(dbValues[KEYS[field]]);
    const fromEnv = clean(process.env[KEYS[field]]);
    values[field] = fromDb ?? fromEnv;
    sources[field] = fromDb ? "db" : fromEnv ? "env" : "none";
  }

  return { values, sources };
}

export async function getGoogleSheetsApiConfig(): Promise<GoogleSheetsApiConfig> {
  return (await resolveConfig()).values;
}

/** Configurazione OAuth con tutti e tre i valori, o null se ne manca uno (connect e callback, T-906). */
export async function getCompleteGoogleSheetsOAuthConfig(): Promise<Required<GoogleSheetsApiConfig> | null> {
  const { clientId, clientSecret, redirectUri } = await getGoogleSheetsApiConfig();
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

export async function getGoogleSheetsApiConfigSnapshot(): Promise<GoogleSheetsApiConfigSnapshot> {
  const { values, sources } = await resolveConfig();

  return {
    clientId: values.clientId ?? "",
    redirectUri: values.redirectUri ?? "",
    hasClientSecret: Boolean(values.clientSecret),
    sources,
  };
}

function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return (url.protocol === "https:" || localHttp) && url.pathname.endsWith(CALLBACK_PATH);
  } catch {
    return false;
  }
}

/**
 * Valida il corpo della PATCH prima di qualsiasi scrittura (T-908): ogni campo è una stringa, null o assente;
 * redirectUri https (http solo per localhost) che termina con la callback; clientId di Google.
 */
export function parseGoogleSheetsConfigPatch(payload: unknown): GoogleSheetsApiConfigPatch {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("Corpo della richiesta non valido");
  }
  const input = payload as Record<string, unknown>;
  const patch: GoogleSheetsApiConfigPatch = {};

  for (const field of FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) {
      if (value === null) {
        patch[field] = null;
      }
      continue;
    }
    if (typeof value !== "string") {
      throw new ValidationError(`${field} deve essere una stringa o null`);
    }
    patch[field] = value.trim();
  }

  if (patch.redirectUri && !isValidRedirectUri(patch.redirectUri)) {
    throw new ValidationError(`redirectUri deve essere un URL https (http solo per localhost) che termina con ${CALLBACK_PATH}`);
  }
  if (patch.clientId && !patch.clientId.endsWith(CLIENT_ID_SUFFIX)) {
    throw new ValidationError(`clientId deve terminare con ${CLIENT_ID_SUFFIX}`);
  }
  return patch;
}

/** Applica la PATCH già validata in una sola transazione: upsert dei valori, eliminazione degli override a null. */
export async function updateGoogleSheetsApiConfig(patch: GoogleSheetsApiConfigPatch) {
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const field of FIELDS) {
    const value = patch[field];
    if (value === null) {
      writes.push(deleteSettingValue(KEYS[field]));
    } else if (value) {
      writes.push(upsertSettingValue({ key: KEYS[field], value, isSecret: field === "clientSecret" }));
    }
  }

  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }
  return getGoogleSheetsApiConfigSnapshot();
}
