import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";

const KEYS = {
  developerToken: "GOOGLE_ADS_DEVELOPER_TOKEN",
  clientId: "GOOGLE_ADS_CLIENT_ID",
  clientSecret: "GOOGLE_ADS_CLIENT_SECRET",
  redirectUri: "GOOGLE_ADS_REDIRECT_URI",
  apiVersion: "GOOGLE_ADS_API_VERSION",
  batchSize: "GOOGLE_ADS_BATCH_SIZE",
} as const;

export type GoogleAdsApiConfig = {
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  apiVersion: string;
  batchSize: number;
};

export type GoogleAdsApiConfigSnapshot = {
  clientId: string;
  redirectUri: string;
  apiVersion: string;
  batchSize: number;
  hasDeveloperToken: boolean;
  hasClientSecret: boolean;
};

function clean(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

export async function getGoogleAdsApiConfig(): Promise<GoogleAdsApiConfig> {
  const dbValues = await getManySettingValues(Object.values(KEYS));

  const developerToken = clean(dbValues[KEYS.developerToken]) ?? clean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const clientId = clean(dbValues[KEYS.clientId]) ?? clean(process.env.GOOGLE_ADS_CLIENT_ID);
  const clientSecret = clean(dbValues[KEYS.clientSecret]) ?? clean(process.env.GOOGLE_ADS_CLIENT_SECRET);
  const redirectUri = clean(dbValues[KEYS.redirectUri]) ?? clean(process.env.GOOGLE_ADS_REDIRECT_URI);
  const apiVersion = clean(dbValues[KEYS.apiVersion]) ?? clean(process.env.GOOGLE_ADS_API_VERSION) ?? "v18";
  const batchSizeRaw = clean(dbValues[KEYS.batchSize]) ?? clean(process.env.GOOGLE_ADS_BATCH_SIZE) ?? "20";
  const batchSize = Math.max(1, Number(batchSizeRaw) || 20);

  return {
    developerToken,
    clientId,
    clientSecret,
    redirectUri,
    apiVersion,
    batchSize,
  };
}

export async function getGoogleAdsApiConfigSnapshot(): Promise<GoogleAdsApiConfigSnapshot> {
  const config = await getGoogleAdsApiConfig();

  return {
    clientId: config.clientId ?? "",
    redirectUri: config.redirectUri ?? "",
    apiVersion: config.apiVersion,
    batchSize: config.batchSize,
    hasDeveloperToken: Boolean(config.developerToken),
    hasClientSecret: Boolean(config.clientSecret),
  };
}

export async function updateGoogleAdsApiConfig(input: {
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  apiVersion?: string;
  batchSize?: number;
}) {
  const writes: Promise<unknown>[] = [];

  if (typeof input.developerToken === "string" && input.developerToken.trim()) {
    writes.push(
      upsertSettingValue({
        key: KEYS.developerToken,
        value: input.developerToken.trim(),
        isSecret: true,
      })
    );
  }

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

  if (typeof input.apiVersion === "string" && input.apiVersion.trim()) {
    writes.push(
      upsertSettingValue({
        key: KEYS.apiVersion,
        value: input.apiVersion.trim(),
        isSecret: false,
      })
    );
  }

  if (typeof input.batchSize === "number" && Number.isFinite(input.batchSize) && input.batchSize > 0) {
    writes.push(
      upsertSettingValue({
        key: KEYS.batchSize,
        value: String(Math.floor(input.batchSize)),
        isSecret: false,
      })
    );
  }

  await Promise.all(writes);
  return getGoogleAdsApiConfigSnapshot();
}
