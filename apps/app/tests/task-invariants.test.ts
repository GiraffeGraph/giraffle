import { migrations } from "@/infrastructure/database/migrations";

const sql = migrations[0]?.sql ?? "";
const table = (name: string) => new RegExp(`CREATE TABLE ${name}\\(([^;]*)\\);`, "s").exec(sql)?.[1] ?? "";

/**
 * One task, three lenses: the taskItem block is canonical, Trek places it on a
 * board, Stride reads its due date, Tower reads its priority. Nothing may hold
 * a second copy of a field another surface owns.
 */
describe("shared task relational invariants", () => {
  test("board placement points at the canonical block instead of copying it", () => {
    const boardTasks = table("board_tasks");

    expect(boardTasks).toContain("block_id TEXT NOT NULL UNIQUE REFERENCES blocks(id)");
    expect(boardTasks).not.toMatch(/\bpriority\b/);
    expect(boardTasks).not.toMatch(/\bdue_date\b/);
    expect(boardTasks).not.toMatch(/\bcompleted\b/);
    expect(boardTasks).not.toMatch(/\bcontent\b/);
  });

  test("a block can sit on at most one board column", () => {
    const boardTasks = table("board_tasks");

    expect(boardTasks).toContain("PRIMARY KEY(board_id, block_id)");
    expect(boardTasks).toContain("column_id TEXT NOT NULL REFERENCES board_columns(id)");
  });

  test("task metadata hangs off the block, one row at most", () => {
    const taskMetadata = table("task_metadata");

    expect(taskMetadata).toContain(
      "block_id TEXT PRIMARY KEY REFERENCES blocks(id) ON DELETE CASCADE",
    );
    for (const column of ["completed", "priority", "due_date", "duration_minutes", "description"]) {
      expect(taskMetadata).toContain(column);
    }
  });

  test("page placement in Tower is independent from task priority", () => {
    const pagePriorities = table("page_priorities");

    expect(pagePriorities).toContain("page_id TEXT PRIMARY KEY REFERENCES pages(id)");
    expect(pagePriorities).toContain("slot TEXT NOT NULL");
    expect(pagePriorities).not.toMatch(/\bblock_id\b/);
  });

  test("every board owns a private page so its tasks are still blocks", () => {
    expect(table("boards")).toContain(
      "task_source_page_id TEXT NOT NULL UNIQUE REFERENCES pages(id) ON DELETE CASCADE",
    );
  });

  test("canvas references rebuild atomically with the scene they came from", () => {
    const canvasReferences = table("canvas_references");

    expect(canvasReferences).toContain("PRIMARY KEY(canvas_id, element_id)");
    expect(canvasReferences).toContain(
      "canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE",
    );
  });
});
