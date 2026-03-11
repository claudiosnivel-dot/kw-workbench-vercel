import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultBrands = [
  { brand: "google", reason: "Global brand default" },
  { brand: "amazon", reason: "Global brand default" },
  { brand: "youtube", reason: "Global brand default" },
  { brand: "facebook", reason: "Global brand default" },
  { brand: "instagram", reason: "Global brand default" },
];

const defaultPatterns = [
  "{seed} for beginners",
  "best {seed}",
  "{seed} near me",
  "how to {seed}",
  "{seed} vs {seed} alternative",
  "free {seed} tool",
  "{seed} template",
  "{seed} examples",
];

async function main() {
  await prisma.brandBlacklist.deleteMany({ where: { project_id: null } });
  await prisma.expansionPattern.deleteMany({ where: { project_id: null } });

  await prisma.brandBlacklist.createMany({
    data: defaultBrands.map((item) => ({
      project_id: null,
      brand: item.brand,
      reason: item.reason,
    })),
  });

  await prisma.expansionPattern.createMany({
    data: defaultPatterns.map((pattern) => ({
      project_id: null,
      pattern,
      enabled: true,
    })),
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed error:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
