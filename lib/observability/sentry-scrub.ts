import type { Event } from "@sentry/nextjs";

// Filtro dei dati personali di ogni evento Sentry prima dell'invio (T-601, CWE-532, CWE-359).
// Funzione pura: restituisce una copia filtrata e non modifica l'evento ricevuto.

const FILTERED = "[Filtered]";
const DROPPED_HEADERS = new Set(["cookie", "authorization", "x-forwarded-for"]);
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "refresh_token",
  "access_token",
  "client_secret",
  "developertoken",
]);

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.has(key.toLowerCase()) ? FILTERED : scrubValue(item)])
    );
  }

  return value;
}

// Un body testuale si filtra se è JSON; altrimenti (per esempio un form urlencoded) si scarta per intero.
function scrubData(data: unknown): unknown {
  if (typeof data !== "string") {
    return scrubValue(data);
  }

  try {
    return JSON.stringify(scrubValue(JSON.parse(data)));
  } catch {
    return FILTERED;
  }
}

/**
 * Toglie cookie e gli header cookie, authorization e x-forwarded-for; sostituisce con '[Filtered]' le chiavi
 * sensibili a qualsiasi profondità di request.data ed extra; riduce user al solo id.
 */
export function scrubEvent<T extends Event>(event: T): T {
  const scrubbed: T = { ...event };

  if (event.request) {
    const request = { ...event.request };
    delete request.cookies;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase()))
      );
    }
    if (request.data !== undefined) {
      request.data = scrubData(request.data);
    }
    scrubbed.request = request;
  }

  if (event.extra) {
    scrubbed.extra = scrubValue(event.extra) as Event["extra"];
  }

  if (event.user) {
    if (event.user.id === undefined) {
      delete scrubbed.user;
    } else {
      scrubbed.user = { id: event.user.id };
    }
  }

  return scrubbed;
}
