// Gate di T-301 (AC-301-1, AC-301-2): verifySessionToken non lancia mai e accetta solo firme valide.
import { randomBytes } from "node:crypto";
import { UserRole, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signPayload } from "@/lib/auth/crypto";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { resetEnvForTests } from "@/lib/env";

// Segreto di sessione generato a ogni esecuzione: nessun valore letterale nel sorgente.
const TEST_SECRET = randomBytes(32).toString("hex");

function base64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

async function signedToken(payloadText: string): Promise<string> {
  const payloadPart = base64Url(payloadText);
  return `${payloadPart}.${await signPayload(payloadPart, TEST_SECRET)}`;
}

beforeAll(() => {
  vi.stubEnv("APP_SESSION_SECRET", TEST_SECRET);
  vi.stubEnv("APP_SESSION_MAX_AGE_SECONDS", undefined);
  resetEnvForTests();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("verifySessionToken con input malformati", () => {
  // covers: AC-301-1
  it("si risolve con null senza rigettare per token non base64url, vuoti, senza punto o con payload non JSON", async () => {
    const validPayloadPart = base64Url(JSON.stringify({ userId: "u1", username: "u1", exp: 4_102_444_800 }));
    const inputs = [
      "abc.!!!",
      "",
      "abc",
      `${validPayloadPart}.!!!`,
      await signedToken("questo non è JSON"),
    ];

    for (const input of inputs) {
      await expect(verifySessionToken(input)).resolves.toBeNull();
    }
  });

  it("si risolve con null per firma di lunghezza errata e per JSON firmato senza userId o exp", async () => {
    const payloadPart = base64Url(JSON.stringify({ userId: "u1", username: "u1", exp: 4_102_444_800 }));
    const inputs = [
      `${payloadPart}.${base64Url("corta")}`,
      await signedToken(JSON.stringify({ username: "u1", exp: 4_102_444_800 })),
      await signedToken(JSON.stringify({ userId: "u1", username: "u1" })),
      await signedToken("null"),
    ];

    for (const input of inputs) {
      await expect(verifySessionToken(input)).resolves.toBeNull();
    }
  });
});

describe("verifySessionToken con token firmati dall'app", () => {
  // covers: AC-301-2
  it("accetta il token creato da createSessionToken e rifiuta lo stesso token con la firma alterata", async () => {
    const token = await createSessionToken({
      userId: "user-301",
      username: "utente-301",
      role: UserRole.SUBSCRIBER,
      status: UserStatus.ACTIVE,
      isRootAdmin: false,
      themeMode: "LIGHT",
      fontScaleMode: "NORMAL",
      colorVisionMode: "NONE",
    });

    // L'ultimo carattere cambia di 4 posizioni nell'alfabeto base64url: cambiano i bit significativi.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = token.at(-1) ?? "";
    const tampered = token.slice(0, -1) + alphabet[(alphabet.indexOf(last) + 4) % 64];

    const verified = await verifySessionToken(token);
    expect(verified?.userId).toBe("user-301");
    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });
});
