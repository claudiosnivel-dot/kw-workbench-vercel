import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seo God Mode",
  description: "Workbench web per keyword research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Link href="/" className="text-base font-semibold tracking-tight sm:text-lg">
                  Seo God Mode
                </Link>

                <nav className="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                  <Link className="btn-secondary w-full text-center sm:w-auto" href="/">
                    Panoramica
                  </Link>
                  <Link className="btn-secondary w-full text-center sm:w-auto" href="/settings/integrations">
                    Integrazioni
                  </Link>
                  <Link className="btn-primary w-full text-center sm:w-auto" href="/projects/new">
                    Nuovo progetto
                  </Link>
                  <LogoutButton className="w-full text-center sm:w-auto" />
                </nav>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
