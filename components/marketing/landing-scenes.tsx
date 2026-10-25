import type { createTranslator, Messages } from "next-intl";
import type { ReactNode } from "react";

/** Le 6 tappe del percorso della pagina principale (T-5801), nell'ordine: ogni tappa ha la sua scena (T-5802). */
export const LANDING_STEPS = ["start", "keywords", "plan", "titles", "article", "publish"] as const;
export type LandingStep = (typeof LANDING_STEPS)[number];

/** Traduzioni del namespace marketing.landing.scenes: gli esempi delle scene nella lingua della pagina. */
export type SceneTranslator = ReturnType<typeof createTranslator<Messages, "marketing.landing.scenes">>;

// Larghezze delle barre dei volumi: decorative, nessun numero mostrato.
const KEYWORD_ROWS = [
  { key: "one", bar: "w-11/12", discarded: false },
  { key: "two", bar: "w-3/4", discarded: false },
  { key: "three", bar: "w-1/2", discarded: false },
  { key: "four", bar: "w-2/5", discarded: true },
  { key: "five", bar: "w-1/4", discarded: true },
] as const;

const PLAN_ARTICLES = [
  { key: "one", status: "done" },
  { key: "two", status: "progress" },
  { key: "three", status: "todo" },
] as const;

const PROPOSED_H2 = ["h2one", "h2two", "h2three"] as const;
const EXPORT_FILES = [".docx", ".html", ".md"] as const;

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="landing-scene-icon" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" className="landing-scene-icon" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 4v5M8 11.5v.5" strokeLinecap="round" />
    </svg>
  );
}

function SceneWindow({ step, title, children }: { step: LandingStep; title: string; children: ReactNode }) {
  return (
    <div className="landing-scene" data-scene={step} aria-hidden="true">
      <div className="landing-scene-bar">
        <span className="landing-scene-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="landing-scene-title">{title}</span>
      </div>
      <div className="landing-scene-body">{children}</div>
    </div>
  );
}

function StartScene({ t }: { t: SceneTranslator }) {
  return (
    <SceneWindow step="start" title={t("start.window")}>
      <div className="landing-scene-label">{t("start.label")}</div>
      <div className="landing-scene-field">
        <span className="landing-scene-typed">{t("start.seed")}</span>
        <span className="landing-scene-caret" />
      </div>
      <div className="landing-scene-split">
        <span className="landing-scene-muted">{t("start.targeting")}</span>
        <span className="landing-scene-button">{t("start.button")}</span>
      </div>
      <div className="landing-scene-note is-done">
        <CheckIcon />
        {t("start.created")}
      </div>
    </SceneWindow>
  );
}

function KeywordsScene({ t }: { t: SceneTranslator }) {
  return (
    <SceneWindow step="keywords" title={t("keywords.window")}>
      <div className="landing-scene-label">{t("keywords.heading")}</div>
      <ul className="landing-scene-rows">
        {KEYWORD_ROWS.map(({ key, bar, discarded }) => (
          <li key={key} className={discarded ? "landing-scene-keyword is-discarded" : "landing-scene-keyword"}>
            <span className="landing-scene-term">{t(`keywords.rows.${key}.term`)}</span>
            <span className={discarded ? "landing-scene-chip is-muted" : "landing-scene-chip"}>
              {t(`keywords.rows.${key}.tag`)}
            </span>
            <span className="landing-scene-meter">
              <span className={`landing-scene-meter-fill ${bar}`} />
            </span>
          </li>
        ))}
      </ul>
    </SceneWindow>
  );
}

function PlanScene({ t }: { t: SceneTranslator }) {
  return (
    <SceneWindow step="plan" title={t("plan.window")}>
      <div className="landing-scene-pillar">
        <span className="landing-scene-chip">{t("plan.pillarLabel")}</span>
        <span className="landing-scene-strong">{t("plan.pillar")}</span>
      </div>
      <div className="landing-scene-tree">
        {PLAN_ARTICLES.map(({ key, status }) => (
          <div key={key} className="landing-scene-branch">
            <span className="landing-scene-term">{t(`plan.articles.${key}.title`)}</span>
            <span className={`landing-scene-status is-${status}`}>{t(`plan.articles.${key}.status`)}</span>
          </div>
        ))}
      </div>
    </SceneWindow>
  );
}

function TitlesScene({ t }: { t: SceneTranslator }) {
  return (
    <SceneWindow step="titles" title={t("titles.window")}>
      <span className="landing-scene-chip">{t("titles.label")}</span>
      <div className="landing-scene-heading is-h1">
        <span className="landing-scene-level">H1</span>
        <span className="landing-scene-strong">{t("titles.h1")}</span>
      </div>
      {PROPOSED_H2.map((key) => (
        <div key={key} className="landing-scene-heading">
          <span className="landing-scene-level">H2</span>
          <span>{t(`titles.${key}`)}</span>
        </div>
      ))}
      <div className="landing-scene-actions">
        <span className="landing-scene-button">{t("titles.use")}</span>
        <span className="landing-scene-button is-quiet">{t("titles.discard")}</span>
      </div>
    </SceneWindow>
  );
}

function ArticleScene({ t }: { t: SceneTranslator }) {
  return (
    <SceneWindow step="article" title={t("article.window")}>
      <div className="landing-scene-editor">
        <div className="landing-scene-page">
          <div className="landing-scene-strong">{t("article.heading")}</div>
          <div className="landing-scene-text">
            {t.rich("article.text", {
              ai: (chunks) => <mark className="landing-scene-mark is-ai">{chunks}</mark>,
              verify: (chunks) => <mark className="landing-scene-mark is-verify">{chunks}</mark>,
            })}
          </div>
          <div className="landing-scene-legend">
            <span className="landing-scene-swatch is-ai" />
            {t("article.aiLabel")}
            <span className="landing-scene-swatch is-verify" />
            {t("article.verifyLabel")}
          </div>
          <span className="landing-scene-button is-quiet">{t("article.rewrite")}</span>
        </div>
        <div className="landing-scene-report">
          <div className="landing-scene-label">{t("article.seoTitle")}</div>
          <div className="landing-scene-note is-done">
            <CheckIcon />
            {t("article.checkH1")}
          </div>
          <div className="landing-scene-note is-done">
            <CheckIcon />
            {t("article.checkOpening")}
          </div>
          <div className="landing-scene-note is-warn">
            <AlertIcon />
            {t("article.checkVerify")}
          </div>
        </div>
      </div>
    </SceneWindow>
  );
}

function PublishScene({ t }: { t: SceneTranslator }) {
  return (
    <SceneWindow step="publish" title={t("publish.window")}>
      <div className="landing-scene-draft">
        <div className="landing-scene-split">
          <span className="landing-scene-label">{t("publish.wordpress")}</span>
          <span className="landing-scene-status is-done">{t("publish.status")}</span>
        </div>
        <div className="landing-scene-strong">{t("publish.title")}</div>
        <span className="landing-scene-line w-full" />
        <span className="landing-scene-line w-11/12" />
        <span className="landing-scene-line w-2/3" />
      </div>
      <div className="landing-scene-muted">{t("publish.download")}</div>
      <div className="landing-scene-files">
        {EXPORT_FILES.map((extension) => (
          <span key={extension} className="landing-scene-file">
            {extension}
          </span>
        ))}
      </div>
    </SceneWindow>
  );
}

const SCENES: Record<LandingStep, (props: { t: SceneTranslator }) => ReactNode> = {
  start: StartScene,
  keywords: KeywordsScene,
  plan: PlanScene,
  titles: TitlesScene,
  article: ArticleScene,
  publish: PublishScene,
};

/**
 * Scena dell'app accanto a una tappa della pagina principale (T-5802): una finestra ricostruita con HTML e CSS, con gli
 * esempi del mercato della lingua dal catalogo. Decorativa: aria-hidden, senza link, pulsanti, campi o tabindex (i
 * «pulsanti» sono span), nessuna immagine e solo i token del tema; l'informazione sta nel testo della tappa.
 */
export function LandingScene({ step, t }: { step: LandingStep; t: SceneTranslator }) {
  const Scene = SCENES[step];
  return <Scene t={t} />;
}
