import { useRouter } from "next/navigation";
import { EXTRACTION_BLOCKED_PARAM } from "@/lib/modules/next-step";
import { keywordsHref } from "@/lib/modules/results-view";

/**
 * Apertura dei risultati di un argomento appena creato (avvio rapido T-2305, nuovo argomento T-2303): con il code che ha
 * impedito la ricerca nel parametro extraction, letto dalla barra del prossimo passo; il refresh aggiorna anche il
 * layout del progetto, che non si ricarica da solo cambiando pagina.
 */
export function useOpenTopic() {
  const router = useRouter();

  return (projectId: string, topicId: string, blockedCode: string | null) => {
    const params = new URLSearchParams();
    if (blockedCode) {
      params.set(EXTRACTION_BLOCKED_PARAM, blockedCode);
    }
    router.push(keywordsHref(projectId, { subprojectId: topicId }, params));
    router.refresh();
  };
}
