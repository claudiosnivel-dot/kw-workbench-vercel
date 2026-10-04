// Gate di T-504 (AC-504-1, AC-504-2, AC-504-3): hash asincrono, formato invariato e hash esistenti ancora validi.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";

// Hash prodotto dalla vecchia implementazione sincrona (stessi parametri) per la password qui sotto.
const LEGACY_HASH =
  "scrypt$DphEp4V8M1ghwzp7TFeU0Q$JjppaSJXA88dQkC3uRb-SwvuO0BX9MaP1J6vyHlzJNLBiqQhu_5yYCT01UINHvSu-a8FSImqkhrsyOjqExmizQ";
const LEGACY_PLAIN = "vecchia password 2025";

describe("hashPassword e verifyPassword", () => {
  // covers: AC-504-1
  it("producono scrypt$salt$hash in base64url e verificano la password giusta e quella sbagliata", async () => {
    const stored = await hashPassword("correct horse 42");

    expect(stored).toMatch(/^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    await expect(verifyPassword("correct horse 42", stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong", stored)).resolves.toBe(false);
  });

  // covers: AC-504-2
  it("verificano un hash generato dalla vecchia implementazione sincrona", async () => {
    await expect(verifyPassword(LEGACY_PLAIN, LEGACY_HASH)).resolves.toBe(true);
  });

  it("restituiscono false per un formato non riconosciuto", async () => {
    await expect(verifyPassword(LEGACY_PLAIN, "bcrypt$abc$def")).resolves.toBe(false);
    await expect(verifyPassword(LEGACY_PLAIN, "scrypt$solo-salt")).resolves.toBe(false);
  });

  // covers: AC-504-3
  it("non bloccano l'event loop: una callback setImmediate registrata dopo la chiamata gira prima della risoluzione", async () => {
    let immediateRan = false;
    const pending = hashPassword("correct horse 42");
    setImmediate(() => {
      immediateRan = true;
    });

    await pending;

    expect(immediateRan).toBe(true);
  });
});
