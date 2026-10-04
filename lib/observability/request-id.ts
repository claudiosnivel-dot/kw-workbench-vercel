// Request id di ogni richiesta (T-602): il proxy lo assegna e lo inoltra in x-request-id, le route
// e i log lo riusano. Un valore esterno vale solo se conforme al pattern, altrimenti se ne genera uno.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export const REQUEST_ID_HEADER = "x-request-id";

export function getRequestId(request: Request): string {
  const header = request.headers.get(REQUEST_ID_HEADER);
  return header && REQUEST_ID_PATTERN.test(header) ? header : crypto.randomUUID();
}
