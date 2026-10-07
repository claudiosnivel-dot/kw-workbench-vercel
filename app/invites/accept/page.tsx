import { TokenLinkCard } from "@/components/token-link-card";
import { AcceptInviteForm } from "@/components/token-link-forms";
import { requirePageUser } from "@/lib/auth/page-guard";
import type { SearchParams } from "@/lib/http/search-params";

export const dynamic = "force-dynamic";

/**
 * Pagina del link di invito (T-1503): solo con una sessione (il proxy porta chi non ha accesso a /login con il link
 * completo come next); il token si consuma col pulsante. Referrer-Policy no-referrer da next.config.ts.
 */
export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageUser();
  return <TokenLinkCard namespace="workspace.accept" searchParams={searchParams} form={(token) => <AcceptInviteForm token={token} />} />;
}
