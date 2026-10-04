import { MetricsStatus, SearchIntent } from "@/lib/generated/prisma/enums";
import { clamp } from "@/lib/utils";
import { keywordCleanlinessScore } from "@/lib/modules/normalization";

export type ScoreInput = {
  keyword: string;
  brand_status: "allowed" | "excluded" | "review";
  search_intent: SearchIntent;
  metrics_status: MetricsStatus;
  avg_monthly_searches?: number;
  competition?: number;
  low_top_of_page_bid_micros?: bigint;
  high_top_of_page_bid_micros?: bigint;
  scoring_profile: string;
};

function heuristicScore(input: ScoreInput): number {
  const words = input.keyword.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lengthFactor = wordCount >= 2 && wordCount <= 6 ? 1 : 0.75;
  const cleanliness = keywordCleanlinessScore(input.keyword);

  let intentWeight = 0.6;
  if (input.search_intent === "commercial" || input.search_intent === "transactional") intentWeight = 1;
  else if (input.search_intent === "informational") intentWeight = 0.75;

  const brandPenalty = input.brand_status === "excluded" ? 0.2 : input.brand_status === "review" ? 0.7 : 1;

  return clamp((lengthFactor * 0.3 + cleanliness * 0.4 + intentWeight * 0.3) * 100 * brandPenalty, 0, 100);
}

function metricsScore(input: ScoreInput): number {
  const volume = Math.max(0, input.avg_monthly_searches ?? 0);
  const competition = clamp(input.competition ?? 0.5, 0, 1);
  const lowBid = Number(input.low_top_of_page_bid_micros ?? 0n) / 1_000_000;
  const highBid = Number(input.high_top_of_page_bid_micros ?? 0n) / 1_000_000;
  const estimatedCpc = lowBid > 0 || highBid > 0 ? (lowBid + highBid) / 2 : 0;

  const volumeScore = clamp(Math.log10(volume + 1) / 4, 0, 1);
  const competitionScore = 1 - competition;
  const cpcScore = clamp(estimatedCpc / 20, 0, 1);

  let intentBoost = 0.5;
  if (input.search_intent === "commercial" || input.search_intent === "transactional") intentBoost = 1;
  else if (input.search_intent === "informational") intentBoost = 0.7;

  const brandPenalty = input.brand_status === "excluded" ? 0.1 : input.brand_status === "review" ? 0.75 : 1;

  return clamp((volumeScore * 0.45 + competitionScore * 0.25 + cpcScore * 0.2 + intentBoost * 0.1) * 100 * brandPenalty, 0, 100);
}

export function scoreKeyword(input: ScoreInput): number {
  const base =
    input.metrics_status === "fetched" || input.metrics_status === "imported" || input.metrics_status === "mock"
      ? metricsScore(input)
      : heuristicScore(input);

  if (input.scoring_profile === "conservative") {
    return clamp(base * 0.9, 0, 100);
  }

  if (input.scoring_profile === "aggressive") {
    return clamp(base * 1.05, 0, 100);
  }

  return clamp(base, 0, 100);
}
