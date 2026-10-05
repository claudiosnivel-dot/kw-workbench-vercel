// Gate di T-704 (AC-704-1…AC-704-4): classificazione per parola intera con lessici per lingua e
// classificazione neutra per le lingue senza lessico.
import { describe, expect, it } from "vitest";
import { classifyKeyword, isClassificationSupported } from "@/lib/modules/classification";

describe("classificazione inglese per parola intera", () => {
  // covers: AC-704-1
  it("le sottostringhe in, app, book, top e kit non classificano più", () => {
    const login = classifyKeyword("login page", "en");
    expect(login.is_local_intent).toBe(false);
    expect(login.search_intent).toBe("navigational");

    expect(classifyKeyword("apple iphone price", "en").search_intent).toBe("commercial");

    const facebook = classifyKeyword("facebook ads guide", "en");
    expect(facebook.search_intent).not.toBe("transactional");
    expect(facebook.keyword_type).toBe("content_topic");

    expect(classifyKeyword("laptop", "en").search_intent).toBe("mixed");
    expect(classifyKeyword("kitchen ideas", "en").keyword_type).toBe("content_topic");
  });

  // covers: AC-704-3
  it("le classificazioni inglesi già corrette restano", () => {
    const question = classifyKeyword("how to tie a tie", "en");
    expect(question.keyword_type).toBe("question");
    expect(question.search_intent).toBe("informational");

    expect(classifyKeyword("buy running shoes", "en").search_intent).toBe("transactional");

    const tool = classifyKeyword("best crm software", "en");
    expect(tool.keyword_type).toBe("tool");
    expect(tool.search_intent).toBe("commercial");
    expect(tool.is_tool_intent).toBe(true);
  });
});

describe("classificazione italiana", () => {
  // covers: AC-704-2
  it("domande, intento locale, transazionale e commerciale in italiano", () => {
    const question = classifyKeyword("come fare la pizza", "it");
    expect(question.is_question).toBe(true);
    expect(question.keyword_type).toBe("question");
    expect(question.search_intent).toBe("informational");

    const local = classifyKeyword("pizzeria vicino a me", "it");
    expect(local.is_local_intent).toBe(true);
    expect(local.keyword_type).toBe("local");

    expect(classifyKeyword("comprare scarpe running", "it").search_intent).toBe("transactional");

    const commercial = classifyKeyword("migliori scarpe running prezzo", "it");
    expect(commercial.search_intent).toBe("commercial");
    expect(commercial.is_commercial_intent).toBe(true);
  });
});

describe("lingue senza lessico", () => {
  // covers: AC-704-4
  it("il tedesco riceve la classificazione neutra e non è supportato", () => {
    expect(classifyKeyword("beste app für fotos", "de")).toEqual({
      keyword_type: "generic",
      search_intent: "mixed",
      is_question: false,
      is_local_intent: false,
      is_tool_intent: false,
      is_commercial_intent: false,
    });
    expect(isClassificationSupported("de")).toBe(false);
    expect(isClassificationSupported("it")).toBe(true);
    expect(isClassificationSupported("en")).toBe(true);
  });
});
