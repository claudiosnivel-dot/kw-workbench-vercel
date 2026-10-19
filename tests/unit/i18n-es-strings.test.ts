// Gate di T-4702 (AC-4702-1): testi del percorso di lavoro scritti come in Spagna e in America Latina (glossario D-47).
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/catalogs";
import { APP_TIME_ZONE } from "@/lib/i18n/locale";

function translator(locale: "es-ES" | "es-419") {
  return createTranslator({ locale, messages: MESSAGES[locale], timeZone: APP_TIME_ZONE });
}

describe("testi spagnoli dell'avvio rapido e dei volumi", () => {
  // covers: AC-4702-1
  it("submit è «Buscar palabras clave» in entrambe; step3 dice súbelo in es-ES e cárgalo in es-419", () => {
    const spain = translator("es-ES");
    const latam = translator("es-419");

    expect(spain("dashboard.quickStart.submit")).toBe("Buscar palabras clave");
    expect(latam("dashboard.quickStart.submit")).toBe("Buscar palabras clave");

    const spainStep = spain("keywords.volumes.step3");
    const latamStep = latam("keywords.volumes.step3");
    expect(spainStep).toContain("súbelo");
    expect(latamStep).toContain("cárgalo");
    expect(spainStep).toContain("Planificador de palabras clave");
    expect(latamStep).toContain("Planificador de palabras clave");
  });

  // covers: AC-4702-1
  it("le differenze del glossario e i plurali si leggono nella variante giusta", () => {
    const spain = translator("es-ES");
    const latam = translator("es-419");

    expect(spain("project.shell.settings")).toBe("Ajustes");
    expect(latam("project.shell.settings")).toBe("Configuración");
    expect(spain("projects.brands.addLabel")).toBe("Añadir una marca");
    expect(latam("projects.brands.addLabel")).toBe("Agregar una marca");
    expect(spain("plan.statusColumns.WRITING")).toBe("En redacción");
    expect(latam("plan.card.pillar")).toBe("Página pilar");
    expect(spain("dashboard.card.keywords", { count: 1 })).toBe("Palabras clave · 1 conservada");
    expect(latam("dashboard.card.keywords", { count: 3 })).toBe("Palabras clave · 3 conservadas");
    expect(spain("dashboard.quickStart.examples.two")).not.toBe(latam("dashboard.quickStart.examples.two"));
  });
});
