// Parser del file scaricato da Keyword Planner (T-905, D-09, D-17). Struttura gestita: encoding dal BOM
// (UTF-16LE, UTF-16BE, UTF-8 con o senza BOM), separatore tab, punto e virgola o virgola, righe di titolo prima
// dei nomi colonna, colonne riconosciute per nome in inglese (guida Google Ads,
// https://support.google.com/google-ads/answer/3022575) e in italiano.
// Da verificare su un file reale scaricato da Keyword Planner: encoding, separatore, numero di righe di titolo,
// nomi italiani delle colonne e «Competition (indexed value)»; le fixture in tests/fixtures/planner/ seguono la
// struttura descritta nel DoD e vanno riallineate al primo file reale (dati anonimizzati).

export type PlannerCsvRow = {
  keyword: string;
  avgMonthlySearches?: number;
  precision?: "exact" | "range";
  competition?: number;
  lowTopOfPageBidMicros?: bigint;
  highTopOfPageBidMicros?: bigint;
};

export type PlannerCsvParseResult = {
  encoding: "utf-16le" | "utf-16be" | "utf-8";
  separator: "\t" | ";" | ",";
  rows: PlannerCsvRow[];
  /** Righe dati senza keyword o con un numero non interpretabile, scartate. */
  skippedRows: number;
};

type Column = "keyword" | "volume" | "competition" | "competitionIndex" | "lowBid" | "highBid";

const COLUMN_NAMES: Record<Column, string[]> = {
  keyword: ["keyword", "parola chiave", "parole chiave"],
  volume: ["avg. monthly searches", "media ricerche mensili"],
  competition: ["competition", "concorrenza"],
  competitionIndex: ["competition (indexed value)", "concorrenza (valore indicizzato)"],
  lowBid: ["top of page bid (low range)", "offerta per la parte superiore della pagina (intervallo basso)"],
  highBid: ["top of page bid (high range)", "offerta per la parte superiore della pagina (intervallo alto)"],
};

const COMPETITION_LEVELS = new Map<string, number>([
  ["low", 0.2],
  ["bassa", 0.2],
  ["medium", 0.5],
  ["media", 0.5],
  ["high", 0.8],
  ["alta", 0.8],
  ["elevata", 0.8],
]);

const SEPARATORS = ["\t", ";", ","] as const;
const SPACES = /[\s  ]/g;

function decode(bytes: Uint8Array): { encoding: PlannerCsvParseResult["encoding"]; text: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "utf-16le", text: new TextDecoder("utf-16le").decode(bytes.subarray(2)) };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "utf-16be", text: new TextDecoder("utf-16be").decode(bytes.subarray(2)) };
  }
  // TextDecoder toglie da solo il BOM UTF-8.
  return { encoding: "utf-8", text: new TextDecoder("utf-8").decode(bytes) };
}

/** Righe e celle con il separatore dato; i campi tra virgolette possono contenere separatori e "" per le virgolette. */
function splitRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      rows.push([...row, cell]);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    rows.push([...row, cell]);
  }
  return rows;
}

function columnOf(name: string): Column | undefined {
  const normalized = name.trim().toLowerCase();
  return (Object.keys(COLUMN_NAMES) as Column[]).find((column) => COLUMN_NAMES[column].includes(normalized));
}

/** Intero con separatori delle migliaia (punto, virgola, spazi) o numero con suffisso K/M e decimali localizzati. */
function parseCount(raw: string): number | null {
  const value = raw.replace(SPACES, "");
  const suffixed = value.match(/^(\d+(?:[.,]\d+)?)([kKmM])$/);
  if (suffixed) {
    return Math.round(Number(suffixed[1].replace(",", ".")) * (/[kK]/.test(suffixed[2]) ? 1_000 : 1_000_000));
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(value) || /^\d+$/.test(value)) {
    return Number(value.replace(/[.,]/g, ""));
  }
  return null;
}

/**
 * Volume: intero -> exact; range «1K – 10K» (trattino lungo, corto o meno) -> punto medio arrotondato e
 * precisione range (D-17); vuoto o «--» -> nessuna metrica; altro -> non interpretabile (null).
 */
function parseVolume(raw: string): { value?: number; precision?: "exact" | "range" } | null {
  const value = raw.trim();
  if (value === "" || value === "--") {
    return {};
  }
  const bounds = value.split(/\s*[–—-]\s*/);
  if (bounds.length === 2) {
    const [low, high] = bounds.map(parseCount);
    return low === null || high === null ? null : { value: Math.round((low + high) / 2), precision: "range" };
  }
  const exact = parseCount(value);
  return exact === null ? null : { value: exact, precision: "exact" };
}

/**
 * Importo localizzato: con punto e virgola insieme l'ultimo è il separatore decimale; con un solo separatore
 * seguito da esattamente 3 cifre e parte intera diversa da 0 è delle migliaia, altrimenti è decimale.
 */
function parseAmount(raw: string): number | null {
  const value = raw.replace(SPACES, "");
  if (value === "" || value === "--") {
    return null;
  }
  const lastSeparator = Math.max(value.lastIndexOf("."), value.lastIndexOf(","));
  let normalized = value;
  if (value.includes(".") && value.includes(",")) {
    normalized = value.slice(0, lastSeparator).replace(/[.,]/g, "") + "." + value.slice(lastSeparator + 1);
  } else if (lastSeparator >= 0) {
    const occurrences = value.split(value[lastSeparator]).length - 1;
    const thousands = occurrences > 1 || (/^[1-9]\d{0,2}[.,]\d{3}$/.test(value) && !value.startsWith("0"));
    normalized = thousands ? value.replace(/[.,]/g, "") : value.replace(",", ".");
  }
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

function toMicros(raw: string | undefined): bigint | undefined | null {
  if (raw === undefined || raw.trim() === "" || raw.trim() === "--") {
    return undefined;
  }
  const amount = parseAmount(raw);
  return amount === null ? null : BigInt(Math.round(amount * 1_000_000));
}

function parseCompetition(level: string | undefined, index: string | undefined): number | undefined {
  const indexed = index !== undefined ? parseCount(index) : null;
  if (indexed !== null && indexed <= 100) {
    return indexed / 100;
  }
  return level !== undefined ? COMPETITION_LEVELS.get(level.trim().toLowerCase()) : undefined;
}

export function parsePlannerCsv(bytes: Uint8Array): PlannerCsvParseResult {
  const { encoding, text } = decode(bytes);

  for (const separator of SEPARATORS) {
    const table = splitRows(text, separator);
    const headerIndex = table.findIndex((cells) => cells.some((cell) => columnOf(cell) === "keyword"));
    if (headerIndex < 0) {
      continue;
    }

    const positions = new Map<Column, number>();
    table[headerIndex].forEach((cell, position) => {
      const column = columnOf(cell);
      if (column && !positions.has(column)) {
        positions.set(column, position);
      }
    });
    const cellOf = (cells: string[], column: Column) => {
      const position = positions.get(column);
      return position === undefined ? undefined : cells[position];
    };

    const rows: PlannerCsvRow[] = [];
    let skippedRows = 0;
    for (const cells of table.slice(headerIndex + 1)) {
      if (cells.every((cell) => cell.trim() === "")) {
        continue;
      }
      const keyword = cellOf(cells, "keyword")?.trim() ?? "";
      const volume = parseVolume(cellOf(cells, "volume") ?? "");
      const lowBid = toMicros(cellOf(cells, "lowBid"));
      const highBid = toMicros(cellOf(cells, "highBid"));
      if (keyword === "" || volume === null || lowBid === null || highBid === null) {
        skippedRows += 1;
        continue;
      }
      rows.push({
        keyword,
        ...(volume.value !== undefined ? { avgMonthlySearches: volume.value, precision: volume.precision } : {}),
        competition: parseCompetition(cellOf(cells, "competition"), cellOf(cells, "competitionIndex")),
        lowTopOfPageBidMicros: lowBid,
        highTopOfPageBidMicros: highBid,
      });
    }
    return { encoding, separator, rows, skippedRows };
  }

  throw new Error("File di Keyword Planner non riconosciuto: nessuna colonna Keyword");
}
