import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/lib/client/http";

/**
 * Scelta di un selettore della barra (lingua T-1301, workspace attivo T-1504): POST all'API che salva la preferenza e,
 * se riesce, ricarica i dati della pagina. saving disabilita il selettore durante l'invio.
 */
export function usePreferencePost() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const save = async (url: string, body: unknown) => {
    setSaving(true);
    try {
      const response = await sendJson("POST", url, body);
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return { saving, save };
}
