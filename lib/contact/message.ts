import { normalizeEmail } from "@/lib/auth/email-address";
import { CONTACT_CATEGORIES, type ContactCategory } from "@/lib/contact/categories";
import { sendTemplateEmail } from "@/lib/email";
import type { ContactMessageVars } from "@/lib/email/templates/contact-message";
import { getSupportEmail } from "@/lib/env";
import { AppError, ValidationError } from "@/lib/http/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";

const MAX_NAME_LENGTH = 100;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5_000;
// CR, LF e ogni altro carattere di controllo: vietati nei campi che finiscono negli header o nell'oggetto (CWE-93).
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type ContactInput = Omit<ContactMessageVars, "account">;

function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string" && (CONTACT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Validazione del modulo contatti (T-1805): nome da 1 a 100 caratteri, email nel formato di T-1401 (al massimo 254
 * caratteri), categoria da elenco chiuso, messaggio da 10 a 5000 caratteri; nome, email e categoria con CR, LF o
 * caratteri di controllo rifiutati. Ogni errore è 400 VALIDATION_ERROR.
 */
export function parseContactInput(body: unknown): ContactInput {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { name, email, category, message } = input;

  if (typeof name !== "string" || typeof email !== "string" || typeof message !== "string") {
    throw new ValidationError("Nome, email e messaggio sono obbligatori");
  }
  if ([name, email, String(category ?? "")].some((field) => CONTROL_CHARACTERS.test(field))) {
    throw new ValidationError("Caratteri non ammessi nei campi del modulo");
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Il nome deve avere da 1 a ${MAX_NAME_LENGTH} caratteri`);
  }
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new ValidationError("Email non valida");
  }
  if (!isContactCategory(category)) {
    throw new ValidationError("Categoria non valida");
  }
  const trimmedMessage = message.trim();
  if (trimmedMessage.length < MIN_MESSAGE_LENGTH || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Il messaggio deve avere da ${MIN_MESSAGE_LENGTH} a ${MAX_MESSAGE_LENGTH} caratteri`);
  }
  return { name: trimmedName, email: normalizedEmail, category, message: trimmedMessage };
}

/**
 * Invio del messaggio a SUPPORT_EMAIL (o APP_ADMIN_EMAIL) con Reply-To del mittente (T-1805). Senza destinatario 503
 * CONTACT_UNAVAILABLE; invio non riuscito (anche con Resend non configurato, D-11 emendata) 503 EMAIL_UNAVAILABLE.
 */
export async function sendContactMessage(input: ContactInput, account: ContactMessageVars["account"]): Promise<void> {
  const to = getSupportEmail();
  if (!to) {
    throw new AppError(503, "CONTACT_UNAVAILABLE", "Modulo contatti non configurato");
  }
  try {
    await sendTemplateEmail({ to, template: "contact-message", locale: DEFAULT_LOCALE, vars: { ...input, account }, replyTo: input.email });
  } catch {
    // L'errore d'invio è già nei log del mittente, senza indirizzi completi né corpo (T-1402).
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Invio dell'email non disponibile");
  }
}
