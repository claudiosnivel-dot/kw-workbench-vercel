import { TokenLinkCard } from "@/components/token-link-card";
import { ResetPasswordForm } from "@/components/token-link-forms";
import type { SearchParams } from "@/lib/http/search-params";

export const dynamic = "force-dynamic";

/** Pagina pubblica del link di recupero password (T-1404). */
export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <TokenLinkCard namespace="auth.reset" searchParams={searchParams} form={(token) => <ResetPasswordForm token={token} />} />;
}
