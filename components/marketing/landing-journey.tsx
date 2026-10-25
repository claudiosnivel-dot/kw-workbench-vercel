"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** Una tappa del percorso: il testo (numero, H3 e testo) e la scena dell'app, resi sul server (T-5801, T-5802). */
export type JourneyStep = { id: string; text: ReactNode; scene: ReactNode };

// Finestra ferma solo da 1024 px e senza riduzione del movimento (T-5901).
const MOTION_QUERY = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";

/**
 * Percorso della pagina principale (T-5901). Senza JavaScript, sotto i 1024 px o con la riduzione del movimento è la
 * pagina del modulo 58: ogni tappa con la sua scena. Altrimenti le scene delle tappe restano al loro posto ma invisibili
 * (stesso layout, nessuno spostamento) e una sola finestra ferma (position sticky) nella colonna delle scene mostra quella
 * della tappa in lettura: la tappa (il suo testo, la scena è nascosta) che contiene la linea a metà della finestra del
 * browser. Le tappe si toccano, quindi anche uno scorrimento a salti trova sempre la tappa nuova. La finestra e
 * l'indicatore sono decorativi (aria-hidden): l'informazione resta nell'elenco delle tappe. Legge solo la posizione dello
 * scorrimento.
 */
export function LandingJourney({ steps }: { steps: JourneyStep[] }) {
  const [motion, setMotion] = useState<"on" | "off" | null>(null);
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const supported = typeof window.matchMedia === "function" && typeof IntersectionObserver === "function";
    const query = supported ? window.matchMedia(MOTION_QUERY) : null;
    const syncMotion = () => setMotion(query?.matches ? "on" : "off");
    syncMotion();
    query?.addEventListener("change", syncMotion);

    return () => query?.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    if (motion !== "on") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(items.current.indexOf(entry.target as HTMLLIElement));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" }
    );
    for (const item of items.current) {
      if (item) observer.observe(item);
    }

    return () => observer.disconnect();
  }, [motion]);

  return (
    <div className="landing-journey" data-motion={motion ?? undefined}>
      <ol className="landing-steps">
        {steps.map((step, index) => (
          <li
            key={step.id}
            ref={(node) => {
              items.current[index] = node;
            }}
            className="landing-step"
          >
            <div className="landing-step-text">{step.text}</div>
            {step.scene}
          </li>
        ))}
      </ol>
      {motion === "on" && (
        <div className="landing-stage" aria-hidden="true">
          <div className="landing-stage-window">
            {steps.map((step, index) => (
              <div key={step.id} className="landing-stage-scene" data-active={index === active ? "" : undefined}>
                {step.scene}
              </div>
            ))}
          </div>
          <ol className="landing-progress">
            {steps.map((step, index) => (
              <li key={step.id} aria-current={index === active ? "step" : undefined}>
                {index + 1}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
