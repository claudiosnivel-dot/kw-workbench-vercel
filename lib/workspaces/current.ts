import { requirePageUser } from "@/lib/auth/page-guard";
import { getPageWorkspace } from "@/lib/authz/workspace";

/**
 * Utente della pagina e suo workspace attivo (T-3101): layout e sezioni dell'area «Workspace» mostrano solo il workspace
 * attivo dell'utente, riverificato da getPageWorkspace (T-1504).
 */
export async function requireCurrentWorkspace() {
  const user = await requirePageUser();
  const { workspace } = await getPageWorkspace(user.id);
  return { user, workspace };
}
