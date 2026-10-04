import fs from "node:fs/promises";
import { MetricsContext, KeywordMetric, MetricsProviderClient } from "@/lib/modules/providers/metrics/types";
import { buildMissingMetrics } from "@/lib/modules/providers/metrics/types";
import { getDecryptedGoogleAdsRefreshToken, getGoogleAdsCredentialRecord } from "@/lib/integrations/google-ads";
import { getGoogleAdsApiConfig } from "@/lib/integrations/google-ads-config";
import { logger } from "@/lib/observability/logger";

type ImportedMetric = {
  keyword: string;
  avgMonthlySearches?: number;
  competition?: number;
  lowTopOfPageBidMicros?: number;
  highTopOfPageBidMicros?: number;
};

type GoogleAdsAuthToken = {
  accessToken: string;
  expiresAt: number;
};

type GoogleAdsRuntimeConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  customerId: string;
  loginCustomerId?: string;
  refreshToken: string;
  apiVersion: string;
  batchSize: number;
};

const languageMap: Record<string, number> = {
  en: 1000,
  de: 1001,
  fr: 1002,
  es: 1003,
  it: 1004,
  pt: 1014,
};

const geoMap: Record<string, number> = {
  US: 2840,
  IT: 2380,
  GB: 2826,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  CA: 2124,
  AU: 2036,
};

let authCache: GoogleAdsAuthToken | null = null;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function toBigIntOrUndefined(value: number | string | undefined): bigint | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return BigInt(Math.trunc(parsed));
}

function parseCompetition(value: unknown, index: unknown): number | undefined {
  if (typeof value === "number") {
    return value > 1 ? Math.min(1, value / 100) : Math.max(0, value);
  }

  if (typeof index === "number") {
    return index > 1 ? Math.min(1, index / 100) : Math.max(0, index);
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized.includes("low")) return 0.2;
    if (normalized.includes("medium")) return 0.5;
    if (normalized.includes("high")) return 0.8;
  }

  return undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function findMetricByKeyword(
  map: Map<string, KeywordMetric>,
  keyword: string,
  defaults: { status: "fetched" | "missing" | "failed" }
): KeywordMetric {
  const existing = map.get(keyword);
  if (existing) {
    return existing;
  }

  const entry: KeywordMetric = {
    keyword,
    metrics_status: defaults.status,
    metrics_provider: "GOOGLE_KEYWORD_PLANNER",
  };

  map.set(keyword, entry);
  return entry;
}

export class GoogleKeywordPlannerMetricsProvider implements MetricsProviderClient {
  readonly id = "GOOGLE_KEYWORD_PLANNER" as const;

  async enrichKeywords(keywords: string[], context: MetricsContext): Promise<Map<string, KeywordMetric>> {
    const imported = await this.loadImportedMetrics();
    if (imported.size > 0) {
      return this.mergeImportedMetrics(keywords, imported);
    }

    const config = await this.resolveRuntimeConfig();
    if (!config) {
      return buildMissingMetrics(keywords, this.id, "missing");
    }

    try {
      const accessToken = await this.getAccessToken(config);
      const resultMap = buildMissingMetrics(keywords, this.id, "missing");
      const batches = chunk(keywords, config.batchSize);

      for (const batch of batches) {
        await this.fetchIdeasBatch({
          batch,
          context,
          config,
          accessToken,
          resultMap,
        });
      }

      for (const keyword of keywords) {
        const metric = resultMap.get(keyword);
        if (!metric) {
          resultMap.set(keyword, {
            keyword,
            metrics_provider: this.id,
            metrics_status: "missing",
          });
        }
      }

      return resultMap;
    } catch (error) {
      logger.warn("keyword_planner_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return buildMissingMetrics(keywords, this.id, "failed");
    }
  }

  private async resolveRuntimeConfig(): Promise<GoogleAdsRuntimeConfig | null> {
    const record = await getGoogleAdsCredentialRecord();
    const refreshToken = (await getDecryptedGoogleAdsRefreshToken()) || process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const apiConfig = await getGoogleAdsApiConfig();

    const developerToken = apiConfig.developerToken;
    const clientId = apiConfig.clientId;
    const clientSecret = apiConfig.clientSecret;
    const customerId = record?.customer_id || process.env.GOOGLE_ADS_CUSTOMER_ID;
    const loginCustomerId = record?.login_customer_id || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined;
    const apiVersion = apiConfig.apiVersion || "v18";
    const batchSize = Math.max(1, apiConfig.batchSize || 20);

    if (!developerToken || !clientId || !clientSecret || !customerId || !refreshToken) {
      return null;
    }

    return {
      developerToken,
      clientId,
      clientSecret,
      customerId,
      loginCustomerId,
      refreshToken,
      apiVersion,
      batchSize,
    };
  }

  private async getAccessToken(config: GoogleAdsRuntimeConfig): Promise<string> {
    if (authCache && authCache.expiresAt > Date.now() + 30_000) {
      return authCache.accessToken;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || "Impossibile ottenere il token di accesso Google");
    }

    authCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Math.max(60_000, (payload.expires_in ?? 3600) * 1000),
    };

    return authCache.accessToken;
  }

  private async fetchIdeasBatch(params: {
    batch: string[];
    context: MetricsContext;
    config: GoogleAdsRuntimeConfig;
    accessToken: string;
    resultMap: Map<string, KeywordMetric>;
  }) {
    if (params.batch.length === 0) {
      return;
    }

    const endpoint = `https://googleads.googleapis.com/${params.config.apiVersion}/customers/${params.config.customerId}:generateKeywordIdeas`;

    const languageConstant = languageMap[params.context.languageCode.toLowerCase()];
    const geoConstant = geoMap[params.context.countryCode.toUpperCase()];

    const body: Record<string, unknown> = {
      keywordAndUrlSeed: {
        keywords: params.batch,
      },
      keywordPlanNetwork: "GOOGLE_SEARCH_AND_PARTNERS",
      includeAdultKeywords: false,
    };

    if (languageConstant) {
      body.language = `languageConstants/${languageConstant}`;
    }

    if (geoConstant) {
      body.geoTargetConstants = [`geoTargetConstants/${geoConstant}`];
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "developer-token": params.config.developerToken,
        "Content-Type": "application/json",
        ...(params.config.loginCustomerId ? { "login-customer-id": params.config.loginCustomerId } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Errore API Google Ads ${response.status}: ${errorText}`);
    }

    const payload = (await response.json()) as {
      results?: Array<{
        text?: string;
        keywordIdeaMetrics?: {
          avgMonthlySearches?: number;
          competition?: number | string;
          competitionIndex?: number;
          lowTopOfPageBidMicros?: number | string;
          highTopOfPageBidMicros?: number | string;
        };
        keyword_idea_metrics?: {
          avg_monthly_searches?: number;
          competition?: number | string;
          competition_index?: number;
          low_top_of_page_bid_micros?: number | string;
          high_top_of_page_bid_micros?: number | string;
        };
      }>;
    };

    const rows = Array.isArray(payload.results) ? payload.results : [];
    for (const row of rows) {
      const keyword = row.text?.trim();
      if (!keyword) {
        continue;
      }

      const camel = row.keywordIdeaMetrics;
      const snake = row.keyword_idea_metrics;

      const avgMonthlySearches =
        (camel?.avgMonthlySearches ?? snake?.avg_monthly_searches ?? undefined) as number | undefined;
      const competition = parseCompetition(
        camel?.competition ?? snake?.competition,
        camel?.competitionIndex ?? snake?.competition_index
      );
      const lowTopBid = toBigIntOrUndefined(camel?.lowTopOfPageBidMicros ?? snake?.low_top_of_page_bid_micros);
      const highTopBid = toBigIntOrUndefined(camel?.highTopOfPageBidMicros ?? snake?.high_top_of_page_bid_micros);

      const metric = findMetricByKeyword(params.resultMap, keyword, { status: "fetched" });
      metric.metrics_status = "fetched";
      metric.metrics_provider = this.id;
      metric.avg_monthly_searches = avgMonthlySearches;
      metric.competition = competition;
      metric.low_top_of_page_bid_micros = lowTopBid;
      metric.high_top_of_page_bid_micros = highTopBid;
    }
  }

  private async loadImportedMetrics(): Promise<Map<string, ImportedMetric>> {
    const filePath = process.env.GOOGLE_ADS_METRICS_FILE;
    if (!filePath) {
      return new Map();
    }

    try {
      const content = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(content) as ImportedMetric[];
      if (!Array.isArray(data)) {
        return new Map();
      }

      const map = new Map<string, ImportedMetric>();
      for (const row of data) {
        if (!row.keyword) {
          continue;
        }
        map.set(normalizeKey(row.keyword), row);
      }
      return map;
    } catch (error) {
      logger.warn("metrics_file_load_failed", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Map();
    }
  }

  private mergeImportedMetrics(
    keywords: string[],
    imported: Map<string, ImportedMetric>
  ): Map<string, KeywordMetric> {
    const map = new Map<string, KeywordMetric>();

    for (const keyword of keywords) {
      const row = imported.get(normalizeKey(keyword));
      if (!row) {
        map.set(keyword, {
          keyword,
          metrics_status: "missing",
          metrics_provider: this.id,
        });
        continue;
      }

      map.set(keyword, {
        keyword,
        metrics_status: "imported",
        metrics_provider: this.id,
        avg_monthly_searches: row.avgMonthlySearches,
        competition: row.competition,
        low_top_of_page_bid_micros: toBigIntOrUndefined(row.lowTopOfPageBidMicros),
        high_top_of_page_bid_micros: toBigIntOrUndefined(row.highTopOfPageBidMicros),
      });
    }

    return map;
  }
}


