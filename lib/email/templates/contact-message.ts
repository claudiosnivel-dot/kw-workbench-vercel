import type { ContactCategory } from "@/lib/contact/categories";
import { emailTranslator, escapeHtml, type RenderedEmail } from "@/lib/email/templates/layout";
import type { AppLocale } from "@/lib/i18n/locale";

export type ContactMessageVars = {
  name: string;
  email: string;
  category: ContactCategory;
  message: string;
  /** Mittente autenticato: id dell'utente e del workspace corrente, nessun altro dato di progetto. */
  account: { userId: string; workspaceId: string | null } | null;
};

/**
 * Messaggio del modulo contatti verso l'indirizzo di supporto (T-1805): oggetto costruito dal server con la sola
 * categoria (CWE-93), ogni campo dell'utente con escape nel corpo HTML (CWE-79) e in chiaro nel testo.
 */
export function render(locale: AppLocale, vars: ContactMessageVars): RenderedEmail {
  const t = emailTranslator(locale);
  const category = t(`contactMessage.categories.${vars.category}`);
  const fields: [string, string][] = [
    [t("contactMessage.name"), vars.name],
    [t("contactMessage.email"), vars.email],
    [t("contactMessage.category"), category],
    ...(vars.account
      ? ([
          [t("contactMessage.userId"), vars.account.userId],
          [t("contactMessage.workspaceId"), vars.account.workspaceId ?? "-"],
        ] as [string, string][])
      : []),
  ];

  const html = [
    `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">`,
    ...fields.map(([label, value]) => `<p style="margin:0 0 8px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`),
    `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(vars.message)}</p>`,
    "</body></html>",
  ].join("");
  const text = [...fields.map(([label, value]) => `${label}: ${value}`), "", vars.message].join("\n");

  return { subject: t("contactMessage.subject", { category }), html, text };
}
