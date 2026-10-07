/** Esito di un form o di un'azione (T-1303): errore in rosso e conferma in verde, testi già tradotti. */
export function FormFeedback({ error, success }: { error?: string | null; success?: string | null }) {
  return (
    <>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </>
  );
}
