import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { VERIFIED, ACCEPTED_DEFAULT_ONLY } from "../../src/core/services/publication";
import { parseYaml } from "../../src/schema/yaml";

describe("Documentation & Codebase Synchronization Contract", () => {
  test("every schema file has a generated doc page and is in mkdocs.yml navigation", async () => {
    const schemaDir = "src/schema/files";
    const docsDir = "docs/reference/services";
    const schemaFiles = (await readdir(schemaDir)).filter(f => f.endsWith(".yaml"));
    const mkdocsContent = await readFile("mkdocs.yml", "utf-8");

    for (const schemaFile of schemaFiles) {
      const service = schemaFile.replace(".yaml", "");
      const docPath = join(docsDir, `${service}.md`);
      const exists = await Bun.file(docPath).exists();
      expect(exists).toBe(true);

      // Must be present in mkdocs.yml nav
      expect(mkdocsContent.includes(`reference/services/${service}.md`)).toBe(true);
    }
  });

  test("publication status in docs/status.md matches src/core/services/publication.ts", async () => {
    const statusDoc = await readFile("docs/status.md", "utf-8");
    const totalSchemas = (await readdir("src/schema/files")).filter(f => f.endsWith(".yaml")).length;

    // Must mention exact total schemas count
    expect(statusDoc.includes(`${totalSchemas} committed service files`) || statusDoc.includes(`${totalSchemas} committed service schemas`)).toBe(true);
    // Must mention exact verified count
    expect(statusDoc.includes(`${VERIFIED.size} verified services`) || statusDoc.includes(`${VERIFIED.size} services verified`)).toBe(true);
  });

  test("every process.env.AUTOCALC_* in src/ is documented in docs/reference/cli.md", async () => {
    const cliDoc = await readFile("docs/reference/cli.md", "utf-8");

    async function getTsFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async entry => {
          const res = join(dir, entry.name);
          return entry.isDirectory() ? getTsFiles(res) : res.endsWith(".ts") ? [res] : [];
        })
      );
      return files.flat();
    }

    const srcFiles = await getTsFiles("src");
    const envVarsInCode = new Set<string>();

    for (const file of srcFiles) {
      const content = await readFile(file, "utf-8");
      const matches = content.matchAll(/process\.env\.(AUTOCALC_[A-Z0-9_]+)/g);
      for (const m of matches) {
        envVarsInCode.add(m[1]);
      }
    }

    // Every env var in code must appear in the CLI documentation
    for (const envVar of envVarsInCode) {
      expect(cliDoc.includes(envVar)).toBe(true);
    }
  });

  test("core CLI commands in src/cli.ts are documented in docs/reference/cli.md", async () => {
    const cliDoc = await readFile("docs/reference/cli.md", "utf-8");
    const cliSrc = await readFile("src/cli.ts", "utf-8");

    // Extract all registered commands: program.command("name ...")
    const commandMatches = cliSrc.matchAll(/\.command\("([a-z0-9_-]+)/g);
    const commands = new Set<string>();
    for (const m of commandMatches) {
      commands.add(m[1]);
    }

    for (const cmd of commands) {
      expect(cliDoc.includes(`autocalc ${cmd}`)).toBe(true);
    }
  });
});
