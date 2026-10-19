// Gate di T-4901 (AC-4901-1): l'email di recupero della password di un utente con lingua es-419 ha oggetto e testo del
// catalogo es-419 unito a es-ES, e lo stesso link di recupero dell'email italiana.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { flushAfter } from "../helpers/next-after";

/** Email di recupero accodata per l'indirizzo, dopo la richiesta e le callback after(). */
async function resetEmailFor(email: string) {
  const response = await callRoute(requestReset, { method: "POST", url: "/api/auth/password-reset/request", body: { email } });
  expect(response.status).toBe(202);
  await flushAfter();
  return prisma.emailOutbox.findFirstOrThrow({ where: { to_address: email, template: "password-reset" } });
}

/** Link di recupero del testo dell'email, senza il token. */
function resetLinkOf(text: string): string {
  const match = /(\S+\/reset-password\?token=)[A-Za-z0-9_-]+/.exec(text);
  expect(match).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  vi.stubEnv("APP_PUBLIC_URL", "https://example.test");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("email di recupero della password in spagnolo (T-4901)", () => {
  // covers: AC-4901-1
  it("con la lingua es-419 oggetto e testo sono del catalogo es-419 (unito a es-ES) e il link è quello dell'italiano", async () => {
    const latam = await createUserWithSession({ displayName: "Lucía", email: "lucia@example.test" });
    await prisma.user.update({ where: { id: latam.user.id }, data: { ui_locale: "es_419" } });
    const italian = await createUserWithSession({ displayName: "Giulia", email: "giulia@example.test" });
    await prisma.user.update({ where: { id: italian.user.id }, data: { ui_locale: "it" } });

    const sent = await resetEmailFor("lucia@example.test");
    const italianSent = await resetEmailFor("giulia@example.test");

    expect(sent.locale).toBe("es-419");
    // Oggetto e pulsante vengono da es-ES (es-419 non li cambia), saluto, testo e scadenza dalle differenze di es-419.
    expect(sent.subject).toBe("Restablece tu contraseña");
    expect(sent.text).toContain("Hola, Lucía:");
    expect(sent.text).toContain("Recibimos una solicitud para restablecer la contraseña de tu cuenta.");
    expect(sent.text).toContain("Elegir una nueva contraseña: https://example.test/reset-password?token=");
    expect(sent.text).toContain("El enlace vence en 1 hora y solo se puede usar una vez.");
    expect(sent.text).toContain("Recibiste este correo electrónico por una acción en tu cuenta.");
    expect(sent.text).not.toContain("Hemos recibido");
    expect(sent.html).toContain('<html lang="es-419">');
    expect(sent.html).toContain("Elegir una nueva contraseña");

    expect(italianSent.subject).toBe("Reimposta la password");
    expect(resetLinkOf(sent.text)).toBe("https://example.test/reset-password?token=");
    expect(resetLinkOf(sent.text)).toBe(resetLinkOf(italianSent.text));
  });
});
