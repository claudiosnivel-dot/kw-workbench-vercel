import Link from "next/link";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getBrandingSnapshot } from "@/lib/integrations/branding";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const [user, branding] = await Promise.all([
    requireAuthenticatedUserFromCookies(),
    getBrandingSnapshot(),
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <p className="mt-2 text-sm text-slate-600">
          Personalizza il branding dell&apos;app. Google Keyword Planner e gestito centralmente dalla dashboard admin.
        </p>

        {user.isRootAdmin ? (
          <p className="mt-3 text-sm text-slate-500">
            Sei root admin: puoi configurare Keyword Planner dalla sezione <Link className="font-medium text-emerald-300 underline decoration-dotted underline-offset-4 hover:text-emerald-200" href="/admin">Admin</Link>.
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            L&apos;integrazione Keyword Planner e amministrata solo dal root admin.
          </p>
        )}
      </section>

      <BrandingSettingsCard
        initial={{
          appName: branding.appName,
          logoUrl: branding.logoUrl,
        }}
      />
    </div>
  );
}

