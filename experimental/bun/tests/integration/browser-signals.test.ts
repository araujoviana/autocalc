import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverBrowserExecutable } from "../../src/core/browser.ts";

const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; }
    await Bun.sleep(100);
  }
  return false;
}

test.skipIf(process.platform === "win32")("signal and stdin shutdown reap the owned Chromium process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "autocalc-signal-"));
  const bundled = chromium.executablePath();
  const shell = bundled.replace(/chromium-(\d+)\/chrome-linux64\/chrome$/, "chromium_headless_shell-$1/chrome-headless-shell-linux64/chrome-headless-shell");
  const browser = discoverBrowserExecutable() ?? (existsSync(shell) ? shell : bundled);
  try {
    for (const mode of ["SIGINT", "SIGTERM", "EOF", "SIGTERM_STARTUP", "CLI_STARTUP"] as const) {
      const pidFile = join(directory, `${mode}.pid`), wrapper = join(directory, `${mode}.sh`);
      await Bun.write(wrapper, `#!/bin/sh\nprintf '%s' "$$" > ${quote(pidFile)}\nexec ${quote(browser)} "$@"\n`);
      await chmod(wrapper, 0o700);
      const child = mode === "CLI_STARTUP"
        ? Bun.spawn([process.execPath, "run", "src/cli.ts", "render-check", "a"], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, AUTOCALC_BROWSER: wrapper } })
        : Bun.spawn([process.execPath, "run", "tests/support/lifecycle-child.ts", wrapper], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
      let browserPid: number | undefined;
      const reader = child.stdout.getReader();
      try {
        if (mode === "SIGTERM_STARTUP" || mode === "CLI_STARTUP") {
          for (let i = 0; i < 120 && !existsSync(pidFile); i++) await Bun.sleep(100);
          expect(existsSync(pidFile)).toBe(true);
        } else {
          const ready = await Promise.race([reader.read(), Bun.sleep(12000).then(() => { throw new Error("Browser startup timed out"); })]);
          expect(new TextDecoder().decode(ready.value)).toContain("READY");
        }
        browserPid = Number(await readFile(pidFile, "utf8"));
        expect(Number.isInteger(browserPid) && browserPid > 0).toBe(true);
        if (mode === "EOF") child.stdin.end(); else child.kill(mode === "SIGTERM_STARTUP" || mode === "CLI_STARTUP" ? "SIGTERM" : mode);
        const exit = await Promise.race([child.exited, Bun.sleep(12000).then(() => { throw new Error(`Browser shutdown timed out (${mode})`); })]);
        expect(exit).toBe(mode === "SIGINT" ? 130 : mode === "EOF" ? 0 : 143);
        expect(await gone(browserPid)).toBe(true);
      } finally {
        reader.releaseLock();
        if (child.exitCode === null) child.kill("SIGKILL");
        if (browserPid && !(await gone(browserPid))) { try { process.kill(browserPid, "SIGKILL"); } catch { /* already exited */ } }
        await child.exited;
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
