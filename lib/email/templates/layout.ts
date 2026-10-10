import { createTranslator } from "next-intl";
import { getPublicAppUrl } from "@/lib/env";
import { MESSAGES } from "@/lib/i18n/catalogs";
import { APP_TIME_ZONE, type AppLocale } from "@/lib/i18n/locale";

export type RenderedEmail = { subject: string; html: string; text: string };

/** Testi di un'email: tutti già tradotti; le variabili sono interpolate dal catalogo e poi sottoposte a escape. */
export type EmailContent = {
  subject: string;
  name: string;
  intro: string;
  action: { label: string; url: string };
  notes?: string[];
};

/** Traduttore del namespace emails nella lingua dell'email (users.ui_locale, fallback it). */
export function emailTranslator(locale: AppLocale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: "emails", timeZone: APP_TIME_ZONE });
}

/**
 * Link assoluto dell'app costruito solo da APP_PUBLIC_URL, mai dall'header Host (T-1402, CWE-640): un attaccante non
 * può far puntare un link con token a un proprio dominio.
 */
export function appLink(path: string, params: Record<string, string> = {}): string {
  const base = getPublicAppUrl();
  if (!base) {
    throw new Error("APP_PUBLIC_URL non impostata: è l'unica base dei link nelle email");
  }

  const url = new URL(path, `${base}/`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

/** Escape HTML di ogni testo e di ogni variabile interpolata (CWE-79). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`;
}

/** Versione HTML e testuale della stessa email: saluto, testo, pulsante, note, link in chiaro e piè di pagina. */
export function composeEmail(locale: AppLocale, content: EmailContent): RenderedEmail {
  const t = emailTranslator(locale);
  const greeting = t("greeting", { name: content.name });
  const notes = content.notes ?? [];
  const { label, url } = content.action;

  const html = [
    `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">`,
    paragraph(greeting),
    paragraph(content.intro),
    `<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></p>`,
    ...notes.map(paragraph),
    paragraph(t("linkHint")),
    `<p style="margin:0 0 16px;word-break:break-all">${escapeHtml(url)}</p>`,
    `<p style="margin:0;color:#64748b;font-size:13px">${escapeHtml(t("footer"))}</p>`,
    "</body></html>",
  ].join("");

  const text = [greeting, content.intro, `${label}: ${url}`, ...notes, t("footer")].join("\n\n");

  return { subject: content.subject, html, text };
}
