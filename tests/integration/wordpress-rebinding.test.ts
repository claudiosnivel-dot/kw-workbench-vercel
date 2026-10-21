// Gate di T-5402 (AC-5402-1, AC-5402-2): con il fetch agli indirizzi controllati vero, un nome host che passa a un
// indirizzo interno fra il controllo preliminare e la connessione (DNS rebinding) rende WP_UNREACHABLE la prova del
// collegamento e l'invio dell'articolo, senza connettersi e senza toccare la bozza salvata (CWE-918, CWE-367).
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { memberWithPlan } from "../helpers/ai-titles";
import { insertReadyArticle } from "../helpers/articles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { stubLookup } from "../helpers/dns";
import { saveConnection, sendToWordPress, testConnection } from "../helpers/wordpress";

const SITE = "https://wp.example.test";
const globalFetch = vi.fn<typeof fetch>();

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

beforeEach(async () => {
  await resetDatabase();
  globalFetch.mockReset();
  vi.stubGlobal("fetch", globalFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Al controllo preliminare un indirizzo pubblico, dalla seconda risoluzione in poi uno interno. */
const rebindingDns = () => stubLookup({ "wp.example.test": (call) => (call === 1 ? ["93.184.216.34"] : ["10.0.0.5"]) });

/** Progetto collegato a wp.example.test con un ADMIN del workspace e l'articolo pronto di uno spoke. */
async function connectedProject(label: string) {
  const setup = await memberWithPlan(label);
  const admin = await createUserWithSession({ displayName: `${label}-admin` });
  await prisma.membership.create({ data: { workspace_id: setup.owner.workspaceId, user_id: admin.user.id, role: "ADMIN" } });
  const articleId = await insertReadyArticle(setup.spoke, {
    slug: "scarpe-running-donna",
    sections: [{ kind: "INTRO", body: "Le scarpe giuste cambiano la corsa." }],
  });
  await saveConnection(setup.plan.projectId, SITE);
  return { ...setup, admin, articleId };
}

describe("WordPress e DNS rebinding", () => {
  // covers: AC-5402-1
  it("la prova del collegamento è WP_UNREACHABLE quando il nome passa a un indirizzo interno alla connessione", async () => {
    const { admin, plan } = await connectedProject("t5402-test");
    const lookup = rebindingDns();

    const response = await testConnection(admin.cookie, plan.projectId);

    expect(response.status).toBe(502);
    expect(((await response.json()) as { code: string }).code).toBe("WP_UNREACHABLE");
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  // covers: AC-5402-2
  it("l'invio dell'articolo è WP_UNREACHABLE e l'articolo resta senza bozza", async () => {
    const { member, spoke, articleId } = await connectedProject("t5402-send");
    const lookup = rebindingDns();

    const response = await sendToWordPress(member.cookie, spoke);
    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId }, select: { wp_post_id: true } });

    expect(response.status).toBe(502);
    expect(((await response.json()) as { code: string }).code).toBe("WP_UNREACHABLE");
    expect(article.wp_post_id).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
