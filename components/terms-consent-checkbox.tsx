"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/** Casella obbligatoria di accettazione di termini e privacy (T-1405), con i link alle pagine legali di T-1803. */
export function TermsConsentCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const t = useTranslations("auth");

  return (
    <label className="flex items-start gap-2 text-sm text-slate-600" htmlFor="acceptTerms">
      <input
        id="acceptTerms"
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required
      />
      <span>
        {t.rich("acceptTerms", {
          terms: (chunks) => (
            <Link href="/terms" className="font-medium underline">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/privacy" className="font-medium underline">
              {chunks}
            </Link>
          ),
        })}
      </span>
    </label>
  );
}
