import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "kw-workbench",
  description: "Workbench web per keyword research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                kw-workbench
              </Link>
              <nav className="flex items-center gap-3 text-sm">
                <Link className="btn-secondary" href="/">
                  Panoramica
                </Link>
                <Link className="btn-secondary" href="/settings/integrations">
                  Integrazioni
                </Link>
                <Link className="btn-primary" href="/projects/new">
                  Nuovo progetto
                </Link>
                <LogoutButton />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
