import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

async function files(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(path, entry.name)) :
      entry.name.endsWith(".ts") ? [join(path, entry.name)] : []))).flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
const paths = [...await files("src/core"), ...(await Bun.file("src/mcp.ts").exists() ? ["src/mcp.ts"] : [])];
const failures: string[] = [];
for (const path of paths) {
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && path.startsWith("src/core/") &&
      (node.moduleSpecifier.text === "commander" || node.moduleSpecifier.text.startsWith("@modelcontextprotocol/sdk")))
      failures.push(`${path}: forbidden interface import ${node.moduleSpecifier.text}`);
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (/^console\.(log|info|debug|table)$/.test(name) || name === "process.stdout.write")
        failures.push(`${path}: forbidden stdout call ${name}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (failures.length) { for (const failure of failures) console.error(failure); process.exitCode = 1; }
