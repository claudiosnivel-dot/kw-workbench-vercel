import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LegalMarkdown } from "@/components/marketing/legal-markdown";
import { isLegalDocument, type LegalDocument, readLegalDocument } from "@/lib/legal/documents";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { marketingLocale, marketingMetadata } from "@/lib/marketing/page";

export const dynamic = "force-dynamic";

type LegalPageProps = { params: Promise<{ lang: string; doc: string }> };

/** Documento del segmento [doc]: solo privacy, terms e cookies, ogni altro valore è una pagina inesistente (404). */
async function legalDocument({ params }: LegalPageProps): Promise<LegalDocument> {
  const { doc } = await params;
  if (!isLegalDocument(doc)) {
    notFound();
  }
  return doc;
}

export async function generateMetadata(props: LegalPageProps): Promise<Metadata> {
  return marketingMetadata(await legalDocument(props), props);
}

/**
 * Pagine legali versionate (T-1803) su /it e /en: il testo viene da content/legal/<lingua>/<documento>.md (D-15,
 * l'agente scrive solo segnaposto); i termini mostrano LEGAL_TERMS_VERSION, la versione accettata con il consenso.
 */
export default async function LegalPage(props: LegalPageProps) {
  const [locale, doc] = await Promise.all([marketingLocale(props), legalDocument(props)]);
  const document = readLegalDocument(locale, doc);
  if (!document) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: "legal" });
  const lastUpdated = document.frontMatter.last_updated;

  return (
    <article className="card space-y-4">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold leading-tight">{t(`titles.${doc}`)}</h1>
        {doc === "terms" && (
          <p className="text-sm text-slate-500" data-testid="terms-version">
            {t("version", { version: LEGAL_TERMS_VERSION })}
          </p>
        )}
        {lastUpdated && <p className="text-sm text-slate-500">{t("lastUpdated", { date: lastUpdated })}</p>}
      </header>
      <LegalMarkdown source={document.body} />
    </article>
  );
}
