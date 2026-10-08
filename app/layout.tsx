import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Manrope, Sora } from "next/font/google";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { PastDueBanner } from "@/components/past-due-banner";
import { PlanLimitNotice } from "@/components/plan-limit-notice";
import { SiteFooter } from "@/components/site-footer";
import { TopNav } from "@/components/top-nav";
import { WorkspaceCookieSync } from "@/components/workspace-cookie-sync";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { canPerform } from "@/lib/authz/permissions";
import { getPageWorkspace } from "@/lib/authz/workspace";
import { getPastDueGraceEnd } from "@/lib/billing/summary";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const dynamic = "force-dynamic";

// Titolo dal branding (T-1104): Next lo inserisce come testo con escaping, mai come HTML (CWE-79).
export async function generateMetadata(): Promise<Metadata> {
  const [branding, t] = await Promise.all([getBrandingSnapshot(), getTranslations("metadata")]);
  return {
    title: branding.appName,
    description: t("description"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [branding, currentUser, locale] = await Promise.all([
    getBrandingSnapshot(),
    getOptionalAuthenticatedUserFromCookies(),
    getLocale(),
  ]);

  // Workspace attivo ed elenco per il selettore (T-1504): stessa query della pagina (cache di React).
  const workspaceContext = currentUser ? await getPageWorkspace(currentUser.id) : null;
  // Pagamento scaduto del workspace attivo (T-1604): solo con il lancio commerciale attivo.
  const pastDueUntil = workspaceContext ? await getPastDueGraceEnd(workspaceContext.workspace.id) : null;
  const canManageBilling = workspaceContext ? canPerform(workspaceContext.workspace.role, "billing.manage") : false;
  const themeMode = currentUser?.themeMode ?? "DARK";
  const fontScaleMode = currentUser?.fontScaleMode ?? "NORMAL";
  const colorVisionMode = currentUser?.colorVisionMode ?? "NONE";

  return (
    <html
      // Lingua risolta per richiesta (T-1301): sempre uno dei letterali di SUPPORTED_LOCALES.
      lang={locale}
      data-theme={themeMode}
      data-font-scale={fontScaleMode}
      data-color-vision={colorVisionMode}
    >
      <body className={`${manrope.variable} ${sora.variable}`}>
        <NextIntlClientProvider>
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="app-glow app-glow-left" />
            <div className="app-glow app-glow-right" />
            <div className="app-grid" />
          </div>

          <div className="min-h-screen">
            <TopNav
              brandName={branding.appName}
              brandLogoUrlDark={branding.logoUrlDark}
              brandLogoUrlLight={branding.logoUrlLight}
              brandLogoUrlLegacy={branding.logoUrl}
              themeMode={themeMode}
              showAdminLink={currentUser?.role === "ADMIN"}
              user={currentUser ? { displayName: currentUser.displayName, email: currentUser.email } : null}
              workspaces={workspaceContext?.workspaces ?? []}
              activeWorkspaceId={workspaceContext?.workspace.id ?? null}
            />
            {workspaceContext?.fallback && <WorkspaceCookieSync workspaceId={workspaceContext.workspace.id} />}
            <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
              {/* Email non ancora verificata (T-1403): l'app resta usabile, le estrazioni no. */}
              {currentUser?.email && !currentUser.emailVerified && (
                <div className="mb-6">
                  <EmailVerificationBanner />
                </div>
              )}
              {/* Limite del piano raggiunto (T-1605) e pagamento scaduto (T-1604) del workspace attivo. */}
              {workspaceContext && <PlanLimitNotice canManageBilling={canManageBilling} />}
              {pastDueUntil && (
                <div className="mb-6">
                  <PastDueBanner graceEndsAt={pastDueUntil.toISOString()} canManageBilling={canManageBilling} />
                </div>
              )}
              {children}
            </main>
            <SiteFooter />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}