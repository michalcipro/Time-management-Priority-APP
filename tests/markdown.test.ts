import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/ai/markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("chat markdown renderer", () => {
  it("renders lists, bold and code without HTML injection", () => {
    const out = html("Priority:\n- **P1** Klient Novák\n- <script>alert(1)</script>\n\nNastavte `ANTHROPIC_API_KEY`.");
    expect(out).toContain("<ul><li><strong>P1</strong> Klient Novák</li>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("<code");
    expect(out).toContain("ANTHROPIC_API_KEY</code>");
  });

  it("keeps underscores inside identifiers and supports italics at word boundaries", () => {
    expect(html("proměnná ANTHROPIC_API_KEY")).toContain("ANTHROPIC_API_KEY");
    expect(html("toto je _důležité_ a *také*")).toContain("<em>důležité</em>");
    expect(html("toto je _důležité_ a *také*")).toContain("<em>také</em>");
  });
});
