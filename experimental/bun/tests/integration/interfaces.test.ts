import { expect, test } from "bun:test";
test("CLI help initializes without starting Chromium", async () => {
  const proc = Bun.spawn([process.execPath, "run", "src/cli.ts", "--help"], { stdout: "pipe", stderr: "pipe" });
  const [output, exit] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  expect(exit).toBe(0);
  expect(output).toContain("Usage:");
  expect(output).toContain("read");
});

test("auth import without a file uses the legacy clipboard path", async () => {
  const proc = Bun.spawn([process.execPath, "run", "src/cli.ts", "auth", "import"], { env: { ...process.env, PATH: "/nonexistent" }, stdout: "pipe", stderr: "pipe" });
  const [stderr, exit] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  expect(exit).toBe(2);
  expect(stderr).toContain("PowerShell is unavailable");
});

test("CLI domain errors include the code and exit with input error status", async () => {
  const proc = Bun.spawn([process.execPath, "run", "src/cli.ts", "read", "not-a-share-id"], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  expect(exit).toBe(2);
  expect(stdout).toBe("");
  expect(stderr).toContain("VALIDATION");
});

test("CLI --json emits structured errors with details", async () => {
  const child = Bun.spawn([process.execPath, "src/cli.ts", "--json", "read", "invalid-url"], { stdout: "pipe", stderr: "pipe" });
  const [status, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(status).toBe(2);
  expect(JSON.parse(stderr)).toMatchObject({ error: "VALIDATION", details: { issues: expect.any(Array) } });
});
