import { BrowserManager } from "../../src/core/browser.ts";

if (import.meta.main) {
  const executable = process.argv[2];
  if (!executable) throw new Error("Browser executable is required");
  const manager = new BrowserManager({ executable });
  const keepAlive = setInterval(() => {}, 1000);
  let closing: Promise<void> | undefined;
  const close = (code: number) => {
    closing ??= manager.close().finally(() => { process.stdin.pause(); clearInterval(keepAlive); process.exitCode = code; });
    return closing;
  };
  process.once("SIGINT", () => { void close(130); });
  process.once("SIGTERM", () => { void close(143); });
  process.stdin.once("end", () => { void close(0); });
  process.stdin.resume();
  try {
    await manager.getBrowser();
    if (!closing) process.stdout.write("READY\n");
  } catch {
    await close(1);
  }
}
