import { defaultTargeting, type Targeting } from "@/lib/modules/default-targeting";
import { prisma } from "@/lib/prisma";

export type { Targeting };

/**
 * Lingua e paese di un nuovo progetto creato dall'avvio rapido (T-2301): quelli del progetto del workspace con
 * l'attività più recente; senza progetti quelli della lingua dell'interfaccia (defaultTargeting, T-4701), con il paese
 * del browser per es-419. Il workspace arriva già autorizzato dalla rotta o dalla pagina.
 */
export async function resolveDefaultTargeting(workspaceId: string, uiLocale: string | null, acceptLanguage: string | null): Promise<Targeting> {
  const latest = await prisma.project.findFirst({
    where: { workspace_id: workspaceId },
    orderBy: [{ last_activity_at: "desc" }, { created_at: "desc" }],
    select: { language_code: true, country_code: true },
  });
  if (latest) {
    return { languageCode: latest.language_code, countryCode: latest.country_code };
  }
  return defaultTargeting(uiLocale, acceptLanguage);
}
