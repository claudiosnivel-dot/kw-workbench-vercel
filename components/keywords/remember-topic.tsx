"use client";

import { useEffect } from "react";
import { LAST_TOPIC_MAX_AGE_SECONDS, lastTopicCookieName } from "@/lib/modules/last-topic";

/**
 * Ricorda nel browser l'ultimo argomento aperto del progetto (T-2403): /projects/<id> lo riapre dopo averlo verificato.
 * Le pagine non scrivono cookie; il valore è solo l'id dell'argomento, mai un dato dell'utente.
 */
export function RememberTopic({ projectId, topicId }: { projectId: string; topicId: string }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${lastTopicCookieName(projectId)}=${encodeURIComponent(topicId)}; path=/; max-age=${LAST_TOPIC_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  }, [projectId, topicId]);

  return null;
}
