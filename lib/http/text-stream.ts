/**
 * Stream a richiesta (T-805, riusato dall'export dell'account di T-1804): ogni lettura del client chiede il pezzo
 * successivo (e quindi il blocco successivo).
 */
export function textStream(chunks: AsyncGenerator<string>, onError: (error: unknown) => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(encoder.encode(value));
        }
      } catch (error) {
        onError(error);
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
