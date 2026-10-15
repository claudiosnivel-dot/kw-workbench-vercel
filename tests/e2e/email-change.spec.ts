// Gate di T-3002 (AC-3002-3): la pagina pubblica del link conferma il cambio dell'email senza sessione, una volta sola.
import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utente dedicato con una password generata a ogni esecuzione, mai una credenziale reale.
const OLD_EMAIL = "e2e-email-old@example.test";
const NEW_EMAIL = "e2e-email-new@example.test";
const EMAILS = [OLD_EMAIL, NEW_EMAIL];
const TOKEN = randomBytes(32).toString("base64url");

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const user = await createE2EUser(OLD_EMAIL, randomBytes(18).toString("hex"));
  const now = new Date();
  await prisma.emailChangeToken.create({
    data: {
      user_id: user.id,
      new_email: NEW_EMAIL,
      token_hash: createHash("sha256").update(TOKEN).digest("hex"),
      created_at: now,
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

// covers: AC-3002-3
test("il link cambia l'email senza sessione e riaperto dice che non è valido", async ({ page }) => {
  const address = `/email-change?token=${TOKEN}`;

  const response = await page.goto(address);

  expect(response?.status()).toBe(200);
  await expect(page.getByText(/Email cambiata/)).toBeVisible();
  const user = await prisma.user.findFirst({ where: { email: NEW_EMAIL }, select: { email: true } });
  expect(user?.email).toBe(NEW_EMAIL);

  await page.goto(address);
  await expect(page.getByText(/Il link non è valido o è scaduto/)).toBeVisible();
});
