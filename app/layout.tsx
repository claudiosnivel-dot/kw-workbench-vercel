import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { TopNav } from "@/components/top-nav";
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

export const metadata: Metadata = {
  title: "Seo God Mode",
  description: "Workspace web per keyword research",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBrandingSnapshot();

  return (
    <html lang="it">
      <body className={`${manrope.variable} ${sora.variable}`}>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div className="app-glow app-glow-left" />
          <div className="app-glow app-glow-right" />
          <div className="app-grid" />
        </div>

        <div className="min-h-screen">
          <TopNav brandName={branding.appName} brandLogoUrl={branding.logoUrl} />
          <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}