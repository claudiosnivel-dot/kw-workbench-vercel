"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { type ApiErrorPayload, buildApiErrorMessage, messageOf, readJsonSafe, sendJson } from "@/lib/client/http";
import type { StrategyAiProposal } from "@/lib/modules/strategy/types";

/** Esito di una modifica del piano: la nuova version, oppure code e messaggio già tradotto. */
export type PlanRequestResult = { ok: true; version: number } | { ok: false; code: string | null; message: string };

/**
 * Esito di una richiesta dei titoli con l'AI (T-3603): la proposta (null per lo scarto), oppure code, messaggio già
 * tradotto e, per RATE_LIMITED, i secondi dopo cui la proposta torna disponibile.
 */
export type AiTitlesResult =
  | { ok: true; proposal: StrategyAiProposal | null }
  | { ok: false; code: string | null; message: string; retryAfterSeconds: number | null };

export type PlanRequests = {
  pending: boolean;
  /** Ultimo errore, già tradotto; dopo un 409 STRATEGY_CONFLICT il messaggio del piano ricaricato. */
  error: string | null;
  clearError: () => void;
  operate: (operation: Record<string, unknown> & { type: string }) => Promise<PlanRequestResult>;
  patchPage: (pageId: string, patch: Record<string, unknown>) => Promise<PlanRequestResult>;
  /** Chiede la proposta dei titoli con l'AI della pagina (T-3601): non cambia la version del piano. */
  suggestTitles: (pageId: string) => Promise<AiTitlesResult>;
  /** Scarta la proposta salvata nella pagina (T-3602). */
  discardProposal: (pageId: string) => Promise<AiTitlesResult>;
};

const PlanRequestsContext = createContext<PlanRequests | null>(null);

/**
 * Modifiche del piano condivise da bacheca, elenco e pannello (T-2504, T-2505): ogni richiesta porta la version
 * corrente (CWE-362), cioè la più alta tra quella letta dalla pagina e l'ultima restituita dal server, così due
 * salvataggi di seguito non aspettano il ricaricamento della pagina. Dopo una modifica riuscita la pagina si ricarica;
 * dopo un 409 STRATEGY_CONFLICT si ricarica comunque e resta il messaggio del piano modificato da un altro membro.
 */
export function PlanRequestsProvider({
  projectId,
  strategyId,
  version,
  children,
}: {
  projectId: string;
  strategyId: string;
  version: number;
  children: ReactNode;
}) {
  const t = useTranslations("plan");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returned, setReturned] = useState(-1);
  const current = Math.max(version, returned);
  const base = `/api/projects/${projectId}/strategies/${strategyId}`;

  const send = async (request: (version: number) => Promise<Response>): Promise<PlanRequestResult> => {
    setPending(true);
    setError(null);
    const fail = (code: string | null, message: string): PlanRequestResult => {
      setError(message);
      return { ok: false, code, message };
    };
    try {
      const response = await request(current);
      if (response.ok) {
        const payload = await readJsonSafe<{ data?: { version?: number } }>(response);
        const next = payload?.data?.version ?? current + 1;
        setReturned(next);
        router.refresh();
        return { ok: true, version: next };
      }
      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (payload?.code === "STRATEGY_CONFLICT") {
        router.refresh();
        return fail(payload.code, t("conflict"));
      }
      return fail(payload?.code ?? null, buildApiErrorMessage(response, payload, tErrors));
    } catch (requestError) {
      return fail(null, messageOf(requestError, tCommon("unexpectedError")));
    } finally {
      setPending(false);
    }
  };

  // Le proposte dell'AI stanno nella pagina (T-3602): dopo una richiesta riuscita il piano si ricarica, così il pannello
  // riaperto mostra la proposta salvata.
  const aiTitles = async (method: "POST" | "DELETE", pageId: string): Promise<AiTitlesResult> => {
    try {
      const response = await fetch(`${base}/pages/${pageId}/titles/suggest`, { method });
      const payload = await readJsonSafe<ApiErrorPayload & { data?: StrategyAiProposal; retryAfter?: number }>(response);
      if (response.ok) {
        router.refresh();
        return { ok: true, proposal: payload?.data ?? null };
      }
      const retryAfter = Number(payload?.retryAfter ?? response.headers.get("Retry-After"));
      return {
        ok: false,
        code: payload?.code ?? null,
        message: buildApiErrorMessage(response, payload, tErrors),
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      };
    } catch (requestError) {
      return { ok: false, code: null, message: messageOf(requestError, tCommon("unexpectedError")), retryAfterSeconds: null };
    }
  };

  const value: PlanRequests = {
    pending,
    error,
    clearError: () => setError(null),
    operate: (operation) => send((version) => sendJson("POST", `${base}/operations`, { version, operation })),
    patchPage: (pageId, patch) => send((version) => sendJson("PATCH", `${base}/pages/${pageId}`, { version, ...patch })),
    suggestTitles: (pageId) => aiTitles("POST", pageId),
    discardProposal: (pageId) => aiTitles("DELETE", pageId),
  };
  return <PlanRequestsContext.Provider value={value}>{children}</PlanRequestsContext.Provider>;
}

/** Modifiche del piano dal PlanRequestsProvider più vicino. */
export function usePlanRequests(): PlanRequests {
  const requests = useContext(PlanRequestsContext);
  if (!requests) {
    throw new Error("usePlanRequests fuori da PlanRequestsProvider");
  }
  return requests;
}
