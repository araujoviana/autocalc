import { expect, test } from "bun:test";
import {
  generateCompletion,
  installCompletion,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  detectShell,
  COMMANDS,
} from "../../src/core/completion.ts";
import { main } from "../../src/cli.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("detectShell detects zsh, fish, and bash fallback", () => {
  expect(detectShell("/bin/zsh")).toBe("zsh");
  expect(detectShell("/usr/local/bin/fish")).toBe("fish");
  expect(detectShell("/bin/bash")).toBe("bash");
  expect(detectShell("sh")).toBe("bash");
});

test("generateBashCompletion outputs valid bash syntax containing commands and options", () => {
  const script = generateBashCompletion();
  expect(script).toContain("_autocalc_completions()");
  expect(script).toContain("complete -F _autocalc_completions autocalc");
  expect(script).toContain("compile");
  expect(script).toContain("plan");
  expect(script).toContain("apply");
  expect(script).toContain("completion");
  expect(script).toContain("sa-brazil-1");
  expect(script).toContain("ecs");
});

test("generateZshCompletion outputs compdef script with subcommands and flags", () => {
  const script = generateZshCompletion();
  expect(script).toContain("#compdef autocalc");
  expect(script).toContain("_autocalc()");
  expect(script).toContain("compdef _autocalc autocalc");
  expect(script).toContain("'compile:Compile a version 1 quote file offline (<50ms)'");
  expect(script).toContain("sa-brazil-1");
  expect(script).toContain("ecs");
});

test("generateFishCompletion outputs fish completions with descriptions", () => {
  const script = generateFishCompletion();
  expect(script).toContain("complete -c autocalc -f");
  expect(script).toContain("__autocalc_needs_command");
  expect(script).toContain("-a \"compile\"");
  expect(script).toContain("-a \"plan\"");
  expect(script).toContain("sa-brazil-1");
  expect(script).toContain("ecs");
});

test("generateCompletion dispatches correctly and rejects unsupported shells", () => {
  expect(generateCompletion("bash")).toContain("complete -F _autocalc_completions autocalc");
  expect(generateCompletion("zsh")).toContain("#compdef autocalc");
  expect(generateCompletion("fish")).toContain("complete -c autocalc -f");
  expect(() => generateCompletion("cmd")).toThrow("Unsupported shell: cmd");
});

test("CLI completion command runs and writes to output stream", async () => {
  let output = "";
  const mockStream = {
    write: (text: string) => {
      output += text;
    },
    isTTY: false,
  };

  const code = await main(["node", "autocalc", "completion", "bash"], mockStream);
  expect(code).toBe(0);
  expect(output).toContain("_autocalc_completions()");
});

test("installCompletion writes completion files for fish, bash, and zsh", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "autocalc-comp-"));
  try {
    const fishRes = await installCompletion("fish", tmp);
    expect(fishRes.path).toContain("autocalc.fish");
    const fishContent = await readFile(fishRes.path, "utf-8");
    expect(fishContent).toContain("complete -c autocalc -f");

    const bashRes = await installCompletion("bash", tmp);
    expect(bashRes.path).toContain("autocalc");
    const bashContent = await readFile(bashRes.path, "utf-8");
    expect(bashContent).toContain("_autocalc_completions");

    const zshRes = await installCompletion("zsh", tmp);
    expect(zshRes.path).toContain("_autocalc");
    const zshContent = await readFile(zshRes.path, "utf-8");
    expect(zshContent).toContain("#compdef autocalc");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("CLI completion --install invokes installer", async () => {
  let output = "";
  const mockStream = {
    write: (text: string) => {
      output += text;
    },
    isTTY: false,
  };

  const code = await main(["node", "autocalc", "completion", "fish", "--install"], mockStream);
  expect(code).toBe(0);
  expect(output).toContain("Installed fish completions");
});
