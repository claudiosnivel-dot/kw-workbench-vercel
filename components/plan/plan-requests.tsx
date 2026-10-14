"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { type ApiErrorPayload, buildApiErrorMessage, messageOf, readJsonSafe, sendJson } from "@/lib/client/http";

/** Esito di una modifica del piano: la nuova version, oppure code e messaggio già tradotto. */
export type PlanRequestResult = { ok: true; version: number } | { ok: false; code: string | null; message: string };

export type PlanRequests = {
  pending: boolean;
  /** Ultimo errore, già tradotto; dopo un 409 STRATEGY_CONFLICT il messaggio del piano ricaricato. */
  error: string | null;
  clearError: () => void;
  operate: (operation: Record<string, unknown> & { type: string }) => Promise<PlanRequestResult>;
  patchPage: (pageId: string, patch: Record<string, unknown>) => Promise<PlanRequestResult>;
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

  const value: PlanRequests = {
    pending,
    error,
    clearError: () => setError(null),
    operate: (operation) => send((version) => sendJson("POST", `${base}/operations`, { version, operation })),
    patchPage: (pageId, patch) => send((version) => sendJson("PATCH", `${base}/pages/${pageId}`, { version, ...patch })),
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
