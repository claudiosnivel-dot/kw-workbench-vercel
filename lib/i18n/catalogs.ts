import type { AppLocale } from "@/lib/i18n/locale";
import en from "@/messages/en.json";
import es419 from "@/messages/es-419.json";
import esES from "@/messages/es-ES.json";
import it from "@/messages/it.json";

type Catalog = typeof it;
export type CatalogLayer = { [key: string]: string | CatalogLayer };

/** Valore proprio di una chiave (mai uno ereditato dal prototipo). */
function own(layer: CatalogLayer, key: string): string | CatalogLayer | undefined {
  return Object.hasOwn(layer, key) ? layer[key] : undefined;
}

function mergeLayer(base: CatalogLayer, layer: CatalogLayer): CatalogLayer {
  const above = Object.entries(layer).map(([key, value]): [string, string | CatalogLayer] => {
    const below = own(base, key);
    return [key, typeof value === "object" && typeof below === "object" ? mergeLayer(below, value) : value];
  });
  // Object.fromEntries crea proprietà proprie (una chiave __proto__ non tocca il prototipo); a chiave doppia vince il livello sopra.
  return Object.fromEntries([...Object.entries(base), ...above]);
}

/**
 * Unione profonda di cataloghi (T-4701): ogni livello sovrascrive le chiavi che ha e lascia quelle del livello sotto.
 * Lo spagnolo è inglese ← es-ES ← es-419: una chiave non ancora tradotta si legge in inglese, es-419 ha le sole differenze.
 */
export function layerCatalogs(...layers: CatalogLayer[]): CatalogLayer {
  return layers.reduce<CatalogLayer>(mergeLayer, {});
}

/**
 * Cataloghi da una mappa statica indicizzata dalla lingua già validata, mai da un percorso composto con l'input
 * (CWE-22): li usano i18n/request.ts e i traduttori fuori dalla richiesta (email, T-1402; strategie, T-1902 e T-1907).
 */
export const MESSAGES: Record<AppLocale, Catalog> = {
  it,
  en,
  "es-ES": layerCatalogs(en, esES) as Catalog,
  "es-419": layerCatalogs(en, esES, es419) as Catalog,
};
