// Corrispondenze tra paese e lingua dell'app e i parametri dell'endpoint Google Ads di DataForSEO (T-902).
//
// location_code: location di primo livello (senza location_code_parent) del CSV
// https://cdn.dataforseo.com/v3/locations/locations_kwrd_2026_09_01.csv (scaricato il 2026-10-06; 96.429 location,
// 244 di primo livello). I codici coincidono con i Criteria ID dei geo target di Google Ads. Senza location di
// primo livello: AX, BY, CU, IR, KP, RU (nessuna chiamata, LOCATION_UNSUPPORTED).
//
// language_code: l'elenco di GET https://api.dataforseo.com/v3/keywords_data/google_ads/languages richiede le
// credenziali e non è stato scaricato. Fonte provvisoria: la tabella ufficiale delle lingue di Google Ads
// (CSV dei codici lingua, URL in docs/METRICS-PROVIDERS.md, scaricata il 2026-10-06), tenendo
// solo i codici dell'app identici al codice Google (ISO 639-1). Restano senza corrispondenza, finché l'elenco di
// DataForSEO non li conferma, zh (Google: zh_CN e zh_TW), he (Google: iw) e fil (Google: tl), e le lingue che
// Google Ads non supporta: si, eu, gl, af, sw, am (nessuna chiamata, LANGUAGE_UNSUPPORTED).

const LOCATION_CODES: Readonly<Record<string, number>> = {
  AD: 2020, AE: 2784, AF: 2004, AG: 2028, AI: 2660, AL: 2008, AM: 2051, AO: 2024, AQ: 2010, AR: 2032, AS: 2016,
  AT: 2040, AU: 2036, AW: 2533, AZ: 2031, BA: 2070, BB: 2052, BD: 2050, BE: 2056, BF: 2854, BG: 2100, BH: 2048,
  BI: 2108, BJ: 2204, BL: 2652, BM: 2060, BN: 2096, BO: 2068, BQ: 2535, BR: 2076, BS: 2044, BT: 2064, BV: 2074,
  BW: 2072, BZ: 2084, CA: 2124, CC: 2166, CD: 2180, CF: 2140, CG: 2178, CH: 2756, CI: 2384, CK: 2184, CL: 2152,
  CM: 2120, CN: 2156, CO: 2170, CR: 2188, CV: 2132, CW: 2531, CX: 2162, CY: 2196, CZ: 2203, DE: 2276, DJ: 2262,
  DK: 2208, DM: 2212, DO: 2214, DZ: 2012, EC: 2218, EE: 2233, EG: 2818, EH: 2732, ER: 2232, ES: 2724, ET: 2231,
  FI: 2246, FJ: 2242, FK: 2238, FM: 2583, FO: 2234, FR: 2250, GA: 2266, GB: 2826, GD: 2308, GE: 2268, GF: 2254,
  GG: 2831, GH: 2288, GI: 2292, GL: 2304, GM: 2270, GN: 2324, GP: 2312, GQ: 2226, GR: 2300, GS: 2239, GT: 2320,
  GU: 2316, GW: 2624, GY: 2328, HK: 2344, HM: 2334, HN: 2340, HR: 2191, HT: 2332, HU: 2348, ID: 2360, IE: 2372,
  IL: 2376, IM: 2833, IN: 2356, IO: 2086, IQ: 2368, IS: 2352, IT: 2380, JE: 2832, JM: 2388, JO: 2400, JP: 2392,
  KE: 2404, KG: 2417, KH: 2116, KI: 2296, KM: 2174, KN: 2659, KR: 2410, KW: 2414, KY: 2136, KZ: 2398, LA: 2418,
  LB: 2422, LC: 2662, LI: 2438, LK: 2144, LR: 2430, LS: 2426, LT: 2440, LU: 2442, LV: 2428, LY: 2434, MA: 2504,
  MC: 2492, MD: 2498, ME: 2499, MF: 2663, MG: 2450, MH: 2584, MK: 2807, ML: 2466, MM: 2104, MN: 2496, MO: 2446,
  MP: 2580, MQ: 2474, MR: 2478, MS: 2500, MT: 2470, MU: 2480, MV: 2462, MW: 2454, MX: 2484, MY: 2458, MZ: 2508,
  NA: 2516, NC: 2540, NE: 2562, NF: 2574, NG: 2566, NI: 2558, NL: 2528, NO: 2578, NP: 2524, NR: 2520, NU: 2570,
  NZ: 2554, OM: 2512, PA: 2591, PE: 2604, PF: 2258, PG: 2598, PH: 2608, PK: 2586, PL: 2616, PM: 2666, PN: 2612,
  PR: 2630, PS: 2275, PT: 2620, PW: 2585, PY: 2600, QA: 2634, RE: 2638, RO: 2642, RS: 2688, RW: 2646, SA: 2682,
  SB: 2090, SC: 2690, SD: 2736, SE: 2752, SG: 2702, SH: 2654, SI: 2705, SJ: 2744, SK: 2703, SL: 2694, SM: 2674,
  SN: 2686, SO: 2706, SR: 2740, SS: 2728, ST: 2678, SV: 2222, SX: 2534, SY: 2760, SZ: 2748, TC: 2796, TD: 2148,
  TF: 2260, TG: 2768, TH: 2764, TJ: 2762, TK: 2772, TL: 2626, TM: 2795, TN: 2788, TO: 2776, TR: 2792, TT: 2780,
  TV: 2798, TW: 2158, TZ: 2834, UA: 2804, UG: 2800, UM: 2581, US: 2840, UY: 2858, UZ: 2860, VA: 2336, VC: 2670,
  VE: 2862, VG: 2092, VI: 2850, VN: 2704, VU: 2548, WF: 2876, WS: 2882, YE: 2887, YT: 2175, ZA: 2710, ZM: 2894,
  ZW: 2716,
};

const LANGUAGE_CODES: ReadonlySet<string> = new Set([
  "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "ar", "hi", "bn", "ur", "pa", "id", "ms", "vi", "tr", "nl",
  "pl", "uk", "ro", "sv", "no", "da", "fi", "el", "cs", "hu", "th", "fa", "ta", "te", "mr", "gu", "kn", "ml", "sk",
  "bg", "hr", "sr", "sl", "lt", "lv", "et", "ca",
]);

/** location_code di DataForSEO per il paese dell'app, o null se il paese non ha una location di primo livello. */
export function toDataForSeoLocationCode(countryCode: string): number | null {
  return LOCATION_CODES[countryCode.toUpperCase()] ?? null;
}

/** language_code di DataForSEO per la lingua dell'app, o null se la lingua non ha corrispondenza verificata. */
export function toDataForSeoLanguageCode(languageCode: string): string | null {
  const code = languageCode.toLowerCase();
  return LANGUAGE_CODES.has(code) ? code : null;
}
