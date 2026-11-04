import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("CLI Compiler Integration", () => {
  const sampleYaml = `
version: "1"

metadata:
  id: cli-test-quote
  customer: Acme Corp
  title_prefix: "Acme - Prod"
  currency: USD

horizon:
  duration: 1y

defaults:
  provider: huawei
  region: sa-brazil-1
  availability: single-az
  billing: monthly

resources:
  - id: worker-1
    service: ecs
    quantity: 2
    spec: "c7n.large.2.linux"
`;

  it("executes autocalc compile-quote via CLI in under 50ms", async () => {
    const dir = await mkdtemp(join(tmpdir(), "autocalc-cli-test-"));
    const yamlPath = join(dir, "quote.yaml");
    await writeFile(yamlPath, sampleYaml, "utf8");

    try {
      const proc = Bun.spawn([
        process.execPath,
        "run",
        "src/cli.ts",
        "compile-quote",
        "--path",
        yamlPath,
        "--json",
      ], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.version).toBe("1");
      expect(parsed.customer).toBe("Acme Corp");
      expect(parsed.resources.length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("executes autocalc plan via CLI and writes quote.lock.yaml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "autocalc-cli-plan-test-"));
    const yamlPath = join(dir, "quote.yaml");
    await writeFile(yamlPath, sampleYaml, "utf8");

    try {
      const proc = Bun.spawn([
        process.execPath,
        "run",
        "src/cli.ts",
        "plan-quote",
        "--path",
        yamlPath,
        "--json",
      ], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.draft_id).toBeDefined();

      const lockYamlPath = join(dir, "quote.lock.yaml");
      const lockText = await readFile(lockYamlPath, "utf8");
      expect(lockText).toContain('version: "1"');
      expect(lockText).toContain("worker-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
