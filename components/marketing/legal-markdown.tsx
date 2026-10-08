import type { ComponentPropsWithoutRef } from "react";
import Markdown, { type Components } from "react-markdown";

/** Link del documento: quelli verso altri siti si aprono a parte senza opener né referrer (T-1803). */
function LegalLink({ href, children, node: _node, ...props }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const external = typeof href === "string" && /^https?:\/\//i.test(href);
  return (
    <a href={href} {...props} className="font-medium underline" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

// Il titolo della pagina è l'unico h1: i titoli del documento scendono di un livello.
const COMPONENTS: Components = {
  a: LegalLink,
  h1: ({ node: _node, ...props }) => <h2 className="text-xl font-semibold" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="text-lg font-semibold" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="font-semibold" {...props} />,
};

/**
 * Markdown delle pagine legali (T-1803) senza HTML grezzo: i tag HTML del file sono scartati (skipHtml, nessun
 * rehype-raw) e le immagini non sono ammesse, quindi anche un file fornito da terzi non porta script, immagini o
 * gestori di eventi nel DOM (CWE-79); gli URL pericolosi (javascript:) li neutralizza la trasformazione di react-markdown.
 */
export function LegalMarkdown({ source }: { source: string }) {
  return (
    <div className="legal-document space-y-4 text-sm leading-6 text-slate-600 sm:text-base">
      <Markdown skipHtml disallowedElements={["img"]} components={COMPONENTS}>
        {source}
      </Markdown>
    </div>
  );
}
