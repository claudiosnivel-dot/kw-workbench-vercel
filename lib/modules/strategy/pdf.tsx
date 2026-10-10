import { Document, Image as PdfImage, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { APP_TIME_ZONE } from "@/lib/i18n/locale";
import type { StrategySettings } from "@/lib/modules/strategy/rules";
import { type CatalogTranslator, catalogTranslator } from "@/lib/modules/strategy/translator";
import type { StrategyPageView, StrategyView } from "@/lib/modules/strategy/types";

/*
 * PDF della strategia da presentare (T-1907, D-34): generato dal server con @react-pdf/renderer, senza browser
 * headless né servizi esterni. Spiegazioni nella lingua scelta, H1, H2 e keyword nella lingua del progetto. Ogni testo
 * dell'utente è un nodo di testo del PDF: nessun HTML viene interpretato (CWE-79).
 */

export type PdfLogo = { data: Buffer; format: "png" | "jpg" };

export type StrategyPdfInput = {
  strategy: StrategyView;
  projectName: string;
  workspaceName: string;
  /** Nome della sezione del perimetro, null per tutto il progetto. */
  sectionName: string | null;
  appName: string;
  logo: PdfLogo | null;
  /** Lingua delle spiegazioni (it o en). */
  locale: string;
  generatedAt: Date;
};

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 10, lineHeight: 1.45, color: "#1e293b" },
  cover: { paddingTop: 160, paddingHorizontal: 56, fontSize: 12, color: "#1e293b" },
  logo: { width: 120, height: 48, objectFit: "contain", marginBottom: 24 },
  brand: { fontSize: 12, color: "#475569", marginBottom: 32 },
  coverTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", marginBottom: 24 },
  coverLine: { fontSize: 12, marginBottom: 6 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  subtitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  paragraph: { marginBottom: 8 },
  muted: { color: "#64748b" },
  block: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1" },
  pageTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  label: { fontFamily: "Helvetica-Bold" },
  item: { marginLeft: 10 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#64748b", textAlign: "center" },
});

function sumVolumes(pages: StrategyPageView[]): number {
  return pages.reduce(
    (total, page) => total + page.keywords.reduce((sum, keyword) => sum + (keyword.volume ?? 0), 0),
    0
  );
}

function PageSection({ page, links, t }: { page: StrategyPageView; links: string[]; t: CatalogTranslator }) {
  const main = page.keywords.find((keyword) => keyword.role === "MAIN");
  const secondary = page.keywords.filter((keyword) => keyword !== main).map((keyword) => keyword.keyword);
  const merged = Number(page.reason.params.merged ?? 0);
  const faq = Number(page.reason.params.faq ?? 0);
  return (
    <View style={styles.block} wrap>
      <Text style={styles.muted}>{t(`strategy.ui.kind.${page.kind}`)}</Text>
      <Text style={styles.pageTitle}>{page.h1}</Text>
      <Text>{t("strategy.pdf.contentType", { type: t(`strategy.ui.contentTypes.${page.contentType}`) })}</Text>
      {main && <Text>{t("strategy.pdf.mainKeyword", { keyword: main.keyword })}</Text>}
      {secondary.length > 0 && <Text>{t("strategy.pdf.secondaryKeywords", { keywords: secondary.join(", ") })}</Text>}
      <Text style={styles.label}>{t("strategy.ui.h2Title")}</Text>
      {page.h2.length > 0 ? (
        page.h2.map((heading, index) => (
          <Text key={`${index}-${heading}`} style={styles.item}>
            {`${index + 1}. ${heading}`}
          </Text>
        ))
      ) : (
        <Text style={styles.item}>{t("strategy.ui.noH2")}</Text>
      )}
      <Text style={styles.label}>{t("strategy.ui.reasonTitle")}</Text>
      <Text>{t(`strategy.reasons.${page.reason.code}`, page.reason.params)}</Text>
      {merged > 0 && <Text>{t("strategy.reasons.MERGED_INTO_PILLAR", { count: merged })}</Text>}
      {faq > 0 && <Text>{t("strategy.ui.faqCount", { count: faq })}</Text>}
      <Text style={styles.label}>{t("strategy.ui.linksTitle")}</Text>
      {links.length > 0 ? (
        links.map((link, index) => (
          <Text key={`${index}-${link}`} style={styles.item}>
            {`- ${link}`}
          </Text>
        ))
      ) : (
        <Text style={styles.item}>{t("strategy.ui.noLinks")}</Text>
      )}
    </View>
  );
}

function criteriaLines(input: StrategyPdfInput, t: CatalogTranslator): string[] {
  const settings = (input.strategy.settings ?? {}) as Partial<StrategySettings>;
  const none = t("strategy.pdf.criteriaNone");
  const lines = [
    t("strategy.pdf.criteriaMode", { mode: t(`strategy.ui.mode.${input.strategy.mode}`) }),
    t("strategy.pdf.criteriaScope", { scope: input.sectionName ?? t("strategy.ui.scopeProject") }),
    t("strategy.pdf.criteriaReview", {
      value: t(settings.reviewStatus === "approved" ? "strategy.ui.reviewApproved" : "strategy.ui.reviewApprovedPending"),
    }),
    t("strategy.pdf.criteriaMinVolume", { value: settings.minVolume ?? none }),
    t("strategy.pdf.criteriaIntent", { value: settings.searchIntent ? t(`results.intent.${settings.searchIntent}`) : none }),
    t("strategy.pdf.criteriaKeywordType", { value: settings.keywordType ? t(`results.type.${settings.keywordType}`) : none }),
    t("strategy.pdf.criteriaLanguage", { language: input.strategy.language }),
  ];
  if (settings.rules) {
    lines.push(
      t("strategy.pdf.criteriaRules", {
        minKeywords: settings.rules.minKeywordsPerSpoke,
        minVolume: settings.rules.minSpokeVolume,
        maxSpokes: settings.rules.maxSpokesPerHub,
        questionVolume: settings.rules.questionSpokeVolume,
        questionsAs: settings.rules.questionsAs,
      })
    );
  }
  return lines;
}

function StrategyDocument({ input, t }: { input: StrategyPdfInput; t: CatalogTranslator }) {
  const { strategy } = input;
  const pages = strategy.hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]);
  const date = new Intl.DateTimeFormat(input.locale, { dateStyle: "long", timeZone: APP_TIME_ZONE }).format(input.generatedAt);
  const footer = (
    <Text
      style={styles.footer}
      fixed
      render={({ pageNumber, totalPages }) => t("strategy.pdf.footer", { app: input.appName, page: pageNumber, pages: totalPages })}
    />
  );

  return (
    <Document title={`${input.projectName} - ${strategy.name}`} author={input.appName} creator={input.appName} producer={input.appName}>
      <Page size="A4" style={styles.cover}>
        {input.logo && <PdfImage style={styles.logo} src={input.logo} />}
        <Text style={styles.brand}>{input.appName}</Text>
        <Text style={styles.coverTitle}>{t("strategy.pdf.coverTitle")}</Text>
        <Text style={styles.coverLine}>{t("strategy.pdf.coverProject", { name: input.projectName })}</Text>
        <Text style={styles.coverLine}>{t("strategy.pdf.coverStrategy", { name: strategy.name })}</Text>
        <Text style={styles.coverLine}>{t("strategy.pdf.coverDate", { date })}</Text>
        <Text style={styles.coverLine}>{t("strategy.pdf.coverWorkspace", { name: input.workspaceName })}</Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{t("strategy.pdf.explainTitle")}</Text>
        {(["explainP1", "explainP2", "explainP3"] as const).map((key) => (
          <Text key={key} style={styles.paragraph}>
            {t(`strategy.pdf.${key}`)}
          </Text>
        ))}

        <Text style={styles.subtitle}>{t("strategy.pdf.summaryTitle")}</Text>
        <Text>{t("strategy.pdf.summaryHubs", { count: strategy.hubs.length })}</Text>
        <Text>{t("strategy.pdf.summaryPages", { count: pages.length })}</Text>
        <Text>{t("strategy.pdf.summaryKeywords", { count: strategy.assignedCount })}</Text>
        <Text>{t("strategy.pdf.summaryVolume", { count: sumVolumes(pages) })}</Text>
        <Text>{t("strategy.pdf.summaryUnassigned", { count: strategy.unassignedCount })}</Text>
        {strategy.truncated && <Text style={styles.paragraph}>{t("strategy.pdf.summaryTruncated")}</Text>}

        <Text style={styles.subtitle}>{t("strategy.pdf.workOrderTitle")}</Text>
        <Text style={styles.paragraph}>{t("strategy.pdf.workOrderIntro")}</Text>
        {pages.map((page, index) => (
          <Text key={page.id} style={styles.item}>
            {t("strategy.pdf.workOrderItem", { number: index + 1, kind: t(`strategy.ui.kind.${page.kind}`), title: page.h1 })}
          </Text>
        ))}
        {footer}
      </Page>

      {strategy.hubs.map((hub, index) => (
        <Page key={hub.pillar.id} size="A4" style={styles.page}>
          <Text style={styles.title}>{t("strategy.pdf.hubTitle", { number: index + 1, title: hub.pillar.h1 })}</Text>
          <PageSection page={hub.pillar} links={hub.spokes.map((spoke) => spoke.h1)} t={t} />
          {hub.spokes.map((spoke) => (
            <PageSection key={spoke.id} page={spoke} links={[hub.pillar.h1]} t={t} />
          ))}
          {footer}
        </Page>
      ))}

      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{t("strategy.pdf.appendixTitle")}</Text>
        <Text style={styles.subtitle}>{t("strategy.ui.unassignedTitle")}</Text>
        {strategy.unassigned.length > 0 ? (
          <>
            <Text style={styles.paragraph}>{t("strategy.reasons.UNASSIGNED")}</Text>
            {strategy.unassigned.map((keyword) => (
              <Text key={keyword.id} style={styles.item}>
                {`- ${keyword.keyword}`}
              </Text>
            ))}
          </>
        ) : (
          <Text>{t("strategy.pdf.noUnassigned")}</Text>
        )}
        <Text style={styles.subtitle}>{t("strategy.pdf.criteriaTitle")}</Text>
        {criteriaLines(input, t).map((line) => (
          <Text key={line} style={styles.paragraph}>
            {line}
          </Text>
        ))}
        {footer}
      </Page>
    </Document>
  );
}

/** PDF della strategia come Buffer (T-1907). */
export function renderStrategyPdf(input: StrategyPdfInput): Promise<Buffer> {
  return renderToBuffer(<StrategyDocument input={input} t={catalogTranslator(input.locale)} />);
}
