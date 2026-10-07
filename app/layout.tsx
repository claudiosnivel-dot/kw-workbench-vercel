import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Manrope, Sora } from "next/font/google";
import { TopNav } from "@/components/top-nav";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
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
            />
            <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}