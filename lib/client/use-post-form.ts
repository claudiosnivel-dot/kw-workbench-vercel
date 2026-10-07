import type { FormEvent } from "react";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useSaveAction } from "@/lib/client/use-save-action";

/**
 * Azione che invia un body con una POST JSON (T-1403, T-1404): durante l'invio saving, poi la conferma successMessage o
 * il messaggio del catalogo per la risposta d'errore. submitWith(body) è l'onSubmit di un form.
 */
export function usePostForm(url: string, successMessage: string) {
  const { saving, error, success, save } = useSaveAction();

  const post = (body: unknown) =>
    save(async (tErrors) => {
      await readApiResponse(await sendJson("POST", url, body), tErrors);
      return successMessage;
    });

  const submitWith = (body: () => unknown) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void post(body());
  };

  return { saving, error, success, post, submitWith };
}
