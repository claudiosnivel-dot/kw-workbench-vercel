export type LanguageOption = {
  code: string;
  label: string;
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en", label: "Inglese" },
  { code: "es", label: "Spagnolo" },
  { code: "fr", label: "Francese" },
  { code: "de", label: "Tedesco" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Portoghese" },
  { code: "ru", label: "Russo" },
  { code: "zh", label: "Cinese (Mandarino)" },
  { code: "ja", label: "Giapponese" },
  { code: "ko", label: "Coreano" },
  { code: "ar", label: "Arabo" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengalese" },
  { code: "ur", label: "Urdu" },
  { code: "pa", label: "Punjabi" },
  { code: "id", label: "Indonesiano" },
  { code: "ms", label: "Malese" },
  { code: "vi", label: "Vietnamita" },
  { code: "tr", label: "Turco" },
  { code: "nl", label: "Olandese" },
  { code: "pl", label: "Polacco" },
  { code: "uk", label: "Ucraino" },
  { code: "ro", label: "Rumeno" },
  { code: "sv", label: "Svedese" },
  { code: "no", label: "Norvegese" },
  { code: "da", label: "Danese" },
  { code: "fi", label: "Finlandese" },
  { code: "el", label: "Greco" },
  { code: "cs", label: "Ceco" },
  { code: "hu", label: "Ungherese" },
  { code: "he", label: "Ebraico" },
  { code: "th", label: "Thailandese" },
  { code: "fa", label: "Persiano" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "si", label: "Singalese" },
  { code: "sk", label: "Slovacco" },
  { code: "bg", label: "Bulgaro" },
  { code: "hr", label: "Croato" },
  { code: "sr", label: "Serbo" },
  { code: "sl", label: "Sloveno" },
  { code: "lt", label: "Lituano" },
  { code: "lv", label: "Lettone" },
  { code: "et", label: "Estone" },
  { code: "ca", label: "Catalano" },
  { code: "eu", label: "Basco" },
  { code: "gl", label: "Galiziano" },
  { code: "af", label: "Afrikaans" },
  { code: "sw", label: "Swahili" },
  { code: "am", label: "Amarico" },
  { code: "fil", label: "Filippino" },
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

const LANGUAGE_CODES_SET = new Set(LANGUAGE_OPTIONS.map((option) => option.code));
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