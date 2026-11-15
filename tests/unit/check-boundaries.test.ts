import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBoundaries, findRelativeImportCycles } from "../../scripts/check-boundaries.ts";

describe("scripts/check-boundaries", () => {
  test("repo src/ has zero circular imports and zero boundary violations", async () => {
    expect(await findRelativeImportCycles(["src"])).toEqual([]);
    expect(await checkBoundaries()).toEqual([]);
  });

  test("detects both import cycles and re-export cycles in temp fixtures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "autocalc-cycle-test-"));
    try {
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(join(dir, "src/a.ts"), 'import { b } from "./b.ts"; export const a = b + 1;\n');
      await writeFile(join(dir, "src/b.ts"), 'import { a } from "./a.ts"; export const b = a + 1;\n');
      await writeFile(join(dir, "src/c.ts"), 'export { d } from "./d.ts";\n');
      await writeFile(join(dir, "src/d.ts"), 'import "./c.ts"; export const d = 1;\n');

      const cycles = await findRelativeImportCycles(["src"], dir);
      expect(cycles).toEqual([
        ["src/a.ts", "src/b.ts", "src/a.ts"],
        ["src/c.ts", "src/d.ts", "src/c.ts"],
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
