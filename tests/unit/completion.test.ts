import { expect, test } from "bun:test";
import {
  generateCompletion,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  detectShell,
  COMMANDS,
} from "../../src/core/completion.ts";
import { main } from "../../src/cli.ts";

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
