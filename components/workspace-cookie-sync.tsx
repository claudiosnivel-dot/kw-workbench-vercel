"use client";

import { useEffect } from "react";
import { sendJson } from "@/lib/client/http";

/**
 * Riscrive il cookie kwb_workspace quando il server ha dovuto ripiegare sul workspace personale (T-1504): cookie
 * assente, malformato o di un workspace non più accessibile. Le pagine non possono scrivere cookie, la rotta sì; la
 * pagina è già resa con il workspace corretto, quindi non serve ricaricarla.
 */
export function WorkspaceCookieSync({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    void sendJson("POST", "/api/workspaces/active", { workspaceId }).catch(() => undefined);
  }, [workspaceId]);

  return null;
}
