// Gate di T-5001 (AC-5001-3, D-47): classificazione delle keyword spagnole per parola intera, anche senza accenti.
import { describe, expect, it } from "vitest";
import { classifyKeyword } from "@/lib/modules/classification";

describe("classificazione spagnola", () => {
  // covers: AC-5001-3
  it("domanda, commerciale, transazionale, locale e strumento in spagnolo", () => {
    const question = classifyKeyword("cómo elegir cama de hospital", "es");
    expect(question.is_question).toBe(true);
    expect(question.keyword_type).toBe("question");
    expect(question.search_intent).toBe("informational");

    const commercial = classifyKeyword("cama de hospital precio", "es");
    expect(commercial.search_intent).toBe("commercial");
    expect(commercial.is_commercial_intent).toBe(true);

    expect(classifyKeyword("alquiler cama de hospital", "es").search_intent).toBe("transactional");

    const local = classifyKeyword("cama de hospital cerca de mi", "es");
    expect(local.is_local_intent).toBe(true);
    expect(local.keyword_type).toBe("local");

    const tool = classifyKeyword("calculadora de dosis", "es");
    expect(tool.is_tool_intent).toBe(true);
    expect(tool.keyword_type).toBe("tool");
  });

  it("le domande si riconoscono anche senza accenti e con la domanda di due parole", () => {
    expect(classifyKeyword("como elegir cama de hospital", "es").keyword_type).toBe("question");
    expect(classifyKeyword("por qué usar cama de hospital", "es").keyword_type).toBe("question");
    expect(classifyKeyword("por que usar cama de hospital", "es").keyword_type).toBe("question");
    expect(classifyKeyword("cama de hospital cerca de mí", "es").keyword_type).toBe("local");
    expect(classifyKeyword("quemador de grasa", "es").is_question).toBe(false);
  });
});
