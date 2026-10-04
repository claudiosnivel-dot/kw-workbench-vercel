import { getLogLevel, LOG_LEVELS, type LogLevel } from "@/lib/env";

/**
 * Logger JSON (T-602): una riga per evento su stdout con ts ISO, level, msg e i campi passati (requestId
 * compreso, se il chiamante lo conosce). Gli Error diventano {name, message, stack}; le chiavi che
 * contengono password, token, secret, cookie, authorization o apikey valgono '[REDACTED]' a qualsiasi
 * profondità (CWE-532). La serializzazione JSON tiene ogni evento su una sola riga (CWE-117).
 */

type Fields = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /password|token|secret|cookie|authorization|apikey/i;
const RESERVED_KEYS = new Set(["ts", "level", "msg"]);

function serialize(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => serialize(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : serialize(item, seen)])
  );
}

function write(level: LogLevel, msg: string, fields: Fields): void {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(getLogLevel())) {
    return;
  }

  const entry: Fields = { ts: new Date().toISOString(), level, msg };
  const safeFields = serialize(fields, new WeakSet()) as Fields;
  for (const [key, value] of Object.entries(safeFields)) {
    if (!RESERVED_KEYS.has(key)) {
      entry[key] = value;
    }
  }

  // JSON.stringify lascia letterali U+2028 e U+2029, che alcuni visualizzatori trattano come fine riga.
  const line = JSON.stringify(entry).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (msg: string, fields: Fields = {}) => write("debug", msg, fields),
  info: (msg: string, fields: Fields = {}) => write("info", msg, fields),
  warn: (msg: string, fields: Fields = {}) => write("warn", msg, fields),
  error: (msg: string, fields: Fields = {}) => write("error", msg, fields),
};
