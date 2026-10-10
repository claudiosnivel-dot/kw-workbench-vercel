import type { PdfLogo } from "@/lib/modules/strategy/pdf";

const INLINE_LOGO = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/;
const REMOTE_TYPE = /^image\/(png|jpeg)\b/;
// Come il logo inline del branding (T-506): al massimo 100 KB.
const MAX_LOGO_BYTES = 102_400;
const LOGO_TIMEOUT_MS = 5_000;

/**
 * Logo del branding (T-506) per la copertina del PDF (T-1907), solo se è un'immagine png o jpeg raggiungibile: un data
 * URL, oppure l'URL https già validato dal branding letto con un timeout, senza redirect e fino a 100 KB. Svg, webp,
 * percorsi locali ed errori danno null: la copertina mostra il solo nome.
 */
export async function loadPdfLogo(url: string): Promise<PdfLogo | null> {
  const inline = INLINE_LOGO.exec(url);
  if (inline) {
    return { data: Buffer.from(inline[2], "base64"), format: inline[1] === "png" ? "png" : "jpg" };
  }
  if (!url.startsWith("https://")) {
    return null;
  }
  try {
    const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    const type = REMOTE_TYPE.exec(response.headers.get("content-type") ?? "");
    if (!response.ok || !type || Number(response.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES) {
      return null;
    }
    const data = Buffer.from(await response.arrayBuffer());
    return data.length <= MAX_LOGO_BYTES ? { data, format: type[1] === "png" ? "png" : "jpg" } : null;
  } catch {
    return null;
  }
}
