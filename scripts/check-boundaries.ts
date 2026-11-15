import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
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

const normalize = (p: string): string => p.replace(/\\/g, "/");

function resolveRelativeTarget(fromFile: string, specifier: string, known: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalize(resolve(dirname(fromFile), specifier));
  const candidates = base.endsWith(".ts") ? [base] : [base, `${base}.ts`, `${base}/index.ts`];
  return candidates.find(candidate => known.has(candidate));
}

/** Find directed circular dependencies among static relative imports/re-exports under `roots`. */
export async function findRelativeImportCycles(
  roots: readonly string[] = ["src"],
  cwd: string = process.cwd(),
): Promise<string[][]> {
  const absFiles = (await Promise.all(roots.map(root => files(resolve(cwd, root)))))
    .flat()
    .map(f => normalize(resolve(f)))
    .sort();
  const known = new Set(absFiles);
  const edges = new Map<string, string[]>();

  for (const absFile of absFiles) {
    const text = await readFile(absFile, "utf8");
    const source = ts.createSourceFile(absFile, text, ts.ScriptTarget.Latest, true);
    const deps: string[] = [];
    for (const stmt of source.statements) {
      let spec: string | undefined;
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        spec = stmt.moduleSpecifier.text;
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        spec = stmt.moduleSpecifier.text;
      }
      if (!spec) continue;
      const target = resolveRelativeTarget(absFile, spec, known);
      if (target) deps.push(target);
    }
    edges.set(absFile, [...new Set(deps)].sort());
  }

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seenKeys = new Set<string>();

  const dfs = (node: string): void => {
    state.set(node, 1);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        const start = stack.indexOf(next);
        const relCycle = [...stack.slice(start), next].map(f => normalize(relative(cwd, f)));
        const key = relCycle.join(" -> ");
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          cycles.push(relCycle);
        }
      } else if (nextState === 0) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const absFile of absFiles) {
    if ((state.get(absFile) ?? 0) === 0) dfs(absFile);
  }
  return cycles;
}

/** Check architectural import/stdout rules and circular relative imports across `src/`. */
export async function checkBoundaries(cwd: string = process.cwd()): Promise<string[]> {
  const coreFiles = (await files(resolve(cwd, "src/core"))).map(f => normalize(relative(cwd, f))).sort();
  const mcpPath = normalize(resolve(cwd, "src/mcp.ts"));
  const paths = [...coreFiles, ...(await Bun.file(mcpPath).exists() ? ["src/mcp.ts"] : [])];
  const failures: string[] = [];
  for (const relPath of paths) {
    const absPath = resolve(cwd, relPath);
    const source = ts.createSourceFile(absPath, await readFile(absPath, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && relPath.startsWith("src/core/") &&
        (node.moduleSpecifier.text === "commander" || node.moduleSpecifier.text.startsWith("@modelcontextprotocol/sdk")))
        failures.push(`${relPath}: forbidden interface import ${node.moduleSpecifier.text}`);
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        if (/^console\.(log|info|debug|table)$/.test(name) || name === "process.stdout.write")
          failures.push(`${relPath}: forbidden stdout call ${name}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const cycle of await findRelativeImportCycles(["src"], cwd)) {
    failures.push(`Circular import detected: ${cycle.join(" -> ")}`);
  }
  return failures;
}

if (import.meta.main) {
  const failures = await checkBoundaries();
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  }
}
