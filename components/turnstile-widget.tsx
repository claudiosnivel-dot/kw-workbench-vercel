"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Script del widget con il rendering esplicito (T-1702): lo inserisce il bundle, così la CSP a nonce con strict-dynamic
// lo ammette; frame-src consente challenges.cloudflare.com solo con la site key impostata (lib/security/csp.ts).
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptLoading: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Script di Turnstile non caricato"));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/**
 * Widget Cloudflare Turnstile (T-1702): consegna il token a onToken, stringa vuota quando scade o fallisce. Il token è
 * monouso: dopo ogni invio il form rimonta il widget (key) per riceverne uno nuovo.
 */
function TurnstileWidget({ siteKey, action, onToken }: { siteKey: string; action: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (!cancelled && container.current && window.turnstile) {
          widgetId = window.turnstile.render(container.current, {
            sitekey: siteKey,
            action,
            callback: onToken,
            "expired-callback": () => onToken(""),
            "error-callback": () => onToken(""),
          });
        }
      })
      .catch(() => onToken(""));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [siteKey, action, onToken]);

  return <div ref={container} />;
}

/**
 * CAPTCHA di un form pubblico (T-1702): con la site key il widget e il token da inviare come turnstileToken; senza
 * (Turnstile non configurato) nessun widget e token vuoto. reset() chiede un token nuovo dopo un invio.
 */
export function useTurnstile(siteKey: string | null | undefined, action: "register" | "password-reset") {
  const [token, setToken] = useState("");
  const [round, setRound] = useState(0);

  const widget = siteKey ? <TurnstileWidget key={round} siteKey={siteKey} action={action} onToken={setToken} /> : null;
  const reset = () => {
    setToken("");
    setRound((value) => value + 1);
  };

  return { token, widget, reset };
}
