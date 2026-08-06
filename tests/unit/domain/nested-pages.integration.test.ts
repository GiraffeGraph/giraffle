import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the page tree against a real PostgreSQL schema. Skipped unless
 * NESTED_PAGES_TEST_DATABASE_URL points at a throwaway database.
 */
const databaseUrl = process.env.NESTED_PAGES_TEST_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

describeIfDatabase("nested pages schema", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  let userId = "";

  beforeAll(async () => {
    const user = await db.user.create({
      data: { email: `nested-${Date.now()}@example.test` },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
    await pool.end();
  });

  it("nests a page under another and cascades the delete", async () => {
    const parent = await db.note.create({
      data: { title: "Parent", userId, position: "a0" },
    });
    const child = await db.note.create({
      data: { title: "Child", userId, parentId: parent.id, position: "a0" },
    });
    const grandchild = await db.note.create({
      data: { title: "Grandchild", userId, parentId: child.id, position: "a0" },
    });

    await db.note.delete({ where: { id: parent.id } });

    const survivors = await db.note.findMany({
      where: { id: { in: [child.id, grandchild.id] } },
    });
    expect(survivors).toEqual([]);
  });

  it("keeps fractional keys ordered by plain string comparison", async () => {
    const keys = ["a0", "a1", "a2", "Zz", "b0"];
    const created = await Promise.all(
      keys.map((position, index) =>
        db.note.create({
          data: { title: `Page ${index}`, userId, position },
        })
      )
    );

    const rows = await db.note.findMany({
      where: { id: { in: created.map((note) => note.id) } },
      select: { position: true },
    });
    const sorted = rows
      .map((row) => row.position)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

    expect(sorted).toEqual(["Zz", "a0", "a1", "a2", "b0"]);

    await db.note.deleteMany({ where: { id: { in: created.map((n) => n.id) } } });
  });
});
