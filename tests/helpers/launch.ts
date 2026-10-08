import { randomBytes } from "node:crypto";
import { revalidateTag } from "next/cache";
import { vi } from "vitest";
import type { LaunchStatus } from "@/lib/billing/launch";
import { resetEnvForTests } from "@/lib/env";
import { upsertSettingValue } from "@/lib/integrations/app-settings";

/**
 * Stato del lancio commerciale scritto direttamente in app_settings (T-1606), senza la checklist: i test delle funzioni
 * commerciali (registrazione pubblica, checkout, limiti) girano con il lancio attivo. resetDatabase lo riporta in
 * pausa. Senza APP_ENCRYPTION_KEY ne imposta una di test, perché app_settings è cifrata.
 */
export async function setCommercialLaunchForTests(status: LaunchStatus): Promise<void> {
  if (!process.env.APP_ENCRYPTION_KEY) {
    vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    resetEnvForTests();
  }
  await upsertSettingValue({
    key: "COMMERCIAL_LAUNCH_STATUS",
    value: JSON.stringify({ status, changedAt: new Date().toISOString(), changedBy: "test" }),
  });
  revalidateTag("commercial-launch", { expire: 0 });
}
