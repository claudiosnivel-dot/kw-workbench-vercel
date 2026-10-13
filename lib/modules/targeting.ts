import { prisma } from "@/lib/prisma";

export type Targeting = { languageCode: string; countryCode: string };

/** Lingua e paese predefiniti per lingua dell'interfaccia, quando il workspace non ha ancora progetti. */
const TARGETING_BY_UI_LOCALE: Record<string, Targeting> = {
  it: { languageCode: "it", countryCode: "IT" },
  en: { languageCode: "en", countryCode: "US" },
};

/**
 * Lingua e paese di un nuovo progetto creato dall'avvio rapido (T-2301): quelli del progetto del workspace con
 * l'attività più recente; senza progetti it/IT con l'interfaccia in italiano o senza lingua scelta, en/US con
 * l'interfaccia in inglese. Il workspace arriva già autorizzato dalla rotta o dalla pagina.
 */
export async function resolveDefaultTargeting(workspaceId: string, uiLocale: string | null): Promise<Targeting> {
  const latest = await prisma.project.findFirst({
    where: { workspace_id: workspaceId },
    orderBy: [{ last_activity_at: "desc" }, { created_at: "desc" }],
    select: { language_code: true, country_code: true },
  });
  if (latest) {
    return { languageCode: latest.language_code, countryCode: latest.country_code };
  }
  return TARGETING_BY_UI_LOCALE[uiLocale ?? ""] ?? TARGETING_BY_UI_LOCALE.it;
}
