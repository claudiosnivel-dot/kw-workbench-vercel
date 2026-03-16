import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";

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

export type GoogleSheetsApiConfigSnapshot = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
};

function clean(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

export async function getGoogleSheetsApiConfig(): Promise<GoogleSheetsApiConfig> {
  const dbValues = await getManySettingValues(Object.values(KEYS));

  return {
    clientId: clean(dbValues[KEYS.clientId]) ?? clean(process.env.GOOGLE_SHEETS_OAUTH_CLIENT_ID),
    clientSecret: clean(dbValues[KEYS.clientSecret]) ?? clean(process.env.GOOGLE_SHEETS_OAUTH_CLIENT_SECRET),
    redirectUri: clean(dbValues[KEYS.redirectUri]) ?? clean(process.env.GOOGLE_SHEETS_OAUTH_REDIRECT_URI),
  };
}

export async function getGoogleSheetsApiConfigSnapshot(): Promise<GoogleSheetsApiConfigSnapshot> {
  const config = await getGoogleSheetsApiConfig();

  return {
    clientId: config.clientId ?? "",
    redirectUri: config.redirectUri ?? "",
    hasClientSecret: Boolean(config.clientSecret),
  };
}

export async function updateGoogleSheetsApiConfig(input: {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}) {
  const writes: Promise<unknown>[] = [];

  if (typeof input.clientId === "string" && input.clientId.trim()) {
    writes.push(
      upsertSettingValue({
        key: KEYS.clientId,
        value: input.clientId.trim(),
        isSecret: false,
      })
    );
  }

  if (typeof input.clientSecret === "string" && input.clientSecret.trim()) {
    writes.push(
      upsertSettingValue({
        key: KEYS.clientSecret,
        value: input.clientSecret.trim(),
        isSecret: true,
      })
    );
  }

  if (typeof input.redirectUri === "string" && input.redirectUri.trim()) {
    writes.push(
      upsertSettingValue({
        key: KEYS.redirectUri,
        value: input.redirectUri.trim(),
        isSecret: false,
      })
    );
  }

  await Promise.all(writes);
  return getGoogleSheetsApiConfigSnapshot();
}