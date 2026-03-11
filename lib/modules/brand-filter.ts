import { BrandStatus } from "@prisma/client";

export type BrandFilterResult = {
  brand_status: BrandStatus;
  brand_reason?: string;
  matchedBrand?: string;
};

export function evaluateBrandStatus(params: {
  keyword: string;
  blacklist: string[];
  excludeBrands: boolean;
}): BrandFilterResult {
  const normalized = ` ${params.keyword.toLowerCase()} `;

  for (const brand of params.blacklist) {
    const token = brand.trim().toLowerCase();
    if (!token) {
      continue;
    }

    if (normalized.includes(` ${token} `) || normalized.includes(token)) {
      return {
        brand_status: params.excludeBrands ? "excluded" : "review",
        brand_reason: `Matched blacklist brand: ${token}`,
        matchedBrand: token,
      };
    }
  }

  return { brand_status: "allowed" };
}
