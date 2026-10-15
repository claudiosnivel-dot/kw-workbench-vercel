import { TokenLinkCard } from "@/components/token-link-card";
import { EmailChangeConfirm } from "@/components/token-link-forms";
import type { SearchParams } from "@/lib/http/search-params";

export const dynamic = "force-dynamic";

/** Pagina pubblica del link di conferma del cambio dell'email (T-3002), anche senza sessione. */
export default function EmailChangePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <TokenLinkCard namespace="auth.emailChange" searchParams={searchParams} form={(token) => <EmailChangeConfirm token={token} />} />;
}
