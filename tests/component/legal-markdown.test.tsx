// Gate di T-1803 (AC-1803-4): il markdown delle pagine legali non porta HTML grezzo nel DOM, nemmeno da file di terzi.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalMarkdown } from "@/components/marketing/legal-markdown";
import { parseLegalMarkdown } from "@/lib/legal/documents";

const FIXTURE = readFileSync(join(process.cwd(), "tests", "fixtures", "legal", "xss.md"), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("markdown delle pagine legali", () => {
  // covers: AC-1803-4
  it("una fixture con script e img con onerror non produce script, immagini né dialog", () => {
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);

    const { container } = render(<LegalMarkdown source={parseLegalMarkdown(FIXTURE).body} />);

    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("[onerror]")).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
    // Il testo legittimo resta: paragrafi e link esterno con rel noopener noreferrer.
    expect(container.textContent).toContain("Paragrafo prima.");
    const external = container.querySelector('a[href="https://example.test/pagina"]');
    expect(external?.getAttribute("rel")).toBe("noopener noreferrer");
    // Il link javascript: perde l'URL pericoloso.
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
