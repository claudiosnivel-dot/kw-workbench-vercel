import { TokenLinkCard } from "@/components/token-link-card";
import { VerifyEmailForm } from "@/components/token-link-forms";
import type { SearchParams } from "@/lib/http/search-params";

export const dynamic = "force-dynamic";

/** Pagina pubblica del link di verifica dell'email (T-1403). */
export default function VerifyEmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <TokenLinkCard namespace="auth.verify" searchParams={searchParams} form={(token) => <VerifyEmailForm token={token} />} />;
}
