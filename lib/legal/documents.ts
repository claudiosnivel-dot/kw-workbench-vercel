import { readFileSync } from "node:fs";
import path from "node:path";
import { type AppLocale, OFFERED_LOCALES } from "@/lib/i18n/locale";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";

/**
 * Pagine legali versionate (T-1803, D-15): content/legal/<cartella>/<documento>.md, scritti dall'utente, da un consulente
 * o da un generatore; l'agente crea solo segnaposto (status placeholder). Front matter obbligatorio: version e
 * last_updated; la version dei termini deve coincidere con LEGAL_TERMS_VERSION del consenso (T-1405).
 */
export const LEGAL_DOCUMENTS = ["privacy", "terms", "cookies"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_CONTENT_DIR = path.join(process.cwd(), "content", "legal");

/** Cartella dei testi di ogni lingua (T-4901): es-ES ed es-419 leggono gli stessi testi spagnoli di content/legal/es. */
const LEGAL_FOLDERS: Record<AppLocale, string> = { it: "it", en: "en", "es-ES": "es", "es-419": "es" };

export function isLegalDocument(value: unknown): value is LegalDocument {
  return typeof value === "string" && (LEGAL_DOCUMENTS as readonly string[]).includes(value);
}

export type ParsedLegalDocument = { frontMatter: Record<string, string>; body: string };

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FRONT_MATTER_LINE = /^([a-z_]+):\s*(.*)$/;

/** Front matter a righe chiave: valore (virgolette facoltative) e corpo markdown; senza front matter, campi vuoti. */
export function parseLegalMarkdown(raw: string): ParsedLegalDocument {
  const match = FRONT_MATTER.exec(raw);
  if (!match) {
    return { frontMatter: {}, body: raw };
  }

  const frontMatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = FRONT_MATTER_LINE.exec(line.trim());
    if (field) {
      frontMatter[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return { frontMatter, body: raw.slice(match[0].length) };
}

/** Percorso del file di un documento: cartella e documento da elenchi chiusi, mai dall'input libero (CWE-22). */
function documentFile(dir: string, folder: string, doc: LegalDocument): string {
  return path.join(dir, folder, `${doc}.md`);
}

function readDocumentFile(file: string): ParsedLegalDocument | null {
  try {
    return parseLegalMarkdown(readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Documento di una lingua letto dal disco, null se il file manca. */
export function readLegalDocument(locale: AppLocale, doc: LegalDocument, dir: string = LEGAL_CONTENT_DIR): ParsedLegalDocument | null {
  return readDocumentFile(documentFile(dir, LEGAL_FOLDERS[locale], doc));
}

/**
 * Problemi dei documenti legali delle lingue offerte, 3 per cartella (npm run legal:check e voce legal della checklist del
 * lancio, T-1606): file mancante, segnaposto, version o last_updated assenti, version dei termini diversa dalla costante
 * del consenso. Vuoto = pubblicabili.
 */
export function checkLegalDocuments(dir: string = LEGAL_CONTENT_DIR, termsVersion: string = LEGAL_TERMS_VERSION): string[] {
  const problems: string[] = [];
  for (const folder of new Set(OFFERED_LOCALES.map((locale) => LEGAL_FOLDERS[locale]))) {
    for (const doc of LEGAL_DOCUMENTS) {
      const absolute = documentFile(dir, folder, doc);
      const file = path.relative(process.cwd(), absolute);
      const document = readDocumentFile(absolute);
      if (!document) {
        problems.push(`${file}: file mancante`);
        continue;
      }
      const { status, version, last_updated: lastUpdated } = document.frontMatter;
      if (status === "placeholder") {
        problems.push(`${file}: segnaposto (status placeholder), servono i testi di D-15`);
      }
      if (!version || !lastUpdated) {
        problems.push(`${file}: front matter senza version o last_updated`);
      } else if (doc === "terms" && version !== termsVersion) {
        problems.push(`${file}: version ${version} diversa da LEGAL_TERMS_VERSION ${termsVersion}`);
      }
    }
  }
  return problems;
}

/** Voce legal della checklist del lancio commerciale (T-1606, D-32): i documenti tutti pubblicabili, nessun segnaposto. */
export function areLegalTextsPublished(): boolean {
  return checkLegalDocuments().length === 0;
}
