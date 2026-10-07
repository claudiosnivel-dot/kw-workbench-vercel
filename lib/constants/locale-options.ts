// Lingue di estrazione nell'ordine del selettore; i nomi arrivano da Intl.DisplayNames nella lingua dell'interfaccia (T-1302).
export const LANGUAGE_CODES: string[] = [
  "en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko", "ar", "hi", "bn", "ur", "pa", "id", "ms", "vi",
  "tr", "nl", "pl", "uk", "ro", "sv", "no", "da", "fi", "el", "cs", "hu", "he", "th", "fa", "ta", "te", "mr",
  "gu", "kn", "ml", "si", "sk", "bg", "hr", "sr", "sl", "lt", "lv", "et", "ca", "eu", "gl", "af", "sw", "am",
  "fil",
];

export const COUNTRY_CODES: string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
];

const LANGUAGE_CODES_SET = new Set(LANGUAGE_CODES);
const COUNTRY_CODES_SET = new Set(COUNTRY_CODES);

export function isSupportedLanguageCode(code: string): boolean {
  return LANGUAGE_CODES_SET.has(code.toLowerCase());
}

export function isSupportedCountryCode(code: string): boolean {
  return COUNTRY_CODES_SET.has(code.toUpperCase());
}

export function normalizeLanguageCode(raw: unknown, fallback = "en"): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (LANGUAGE_CODES_SET.has(value)) {
    return value;
  }

  const shortCode = value.split("-")[0] ?? "";
  if (LANGUAGE_CODES_SET.has(shortCode)) {
    return shortCode;
  }

  return fallback;
}

export function normalizeCountryCode(raw: unknown, fallback = "US"): string {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value) {
    return fallback;
  }

  if (COUNTRY_CODES_SET.has(value)) {
    return value;
  }

  return fallback;
}