import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfileLease } from "../../src/core/profile-lease.ts";
test("profile lease rejects a live owner and can be reacquired after release", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-lease-"));
  try {
    const first = await ProfileLease.acquire(path);
    await expect(ProfileLease.acquire(path)).rejects.toMatchObject({ code: "PROFILE_BUSY" });
    await first.release();
    const second = await ProfileLease.acquire(path);
    await second.release();
  } finally { await rm(path, { recursive: true, force: true }); }
});

test("a separate process holds the profile lease until it exits", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-cross-lease-"));
  const child = Bun.spawn([process.execPath, "run", "tests/support/lease-child.ts", path], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const reader = child.stdout.getReader();
  try {
    const output = await Promise.race([reader.read(), Bun.sleep(10000).then(() => { throw new Error("Lease owner did not start"); })]);
    expect(new TextDecoder().decode(output.value)).toContain("READY");
    await expect(ProfileLease.acquire(path)).rejects.toMatchObject({ code: "PROFILE_BUSY" });
    child.stdin.end();
    expect(await child.exited).toBe(0);
    const lease = await ProfileLease.acquire(path);
    await lease.release();
  } finally {
    reader.releaseLock();
    if (child.exitCode === null) child.kill();
    await child.exited;
    await rm(path, { recursive: true, force: true });
  }
}, 15000);

test("concurrent stale-lease recovery leaves exactly one owner", async () => {
  const path = await mkdtemp(join(tmpdir(), "autocalc-stale-lease-"));
  try {
    const leasePath = join(path, ".autocalc-lease");
    await mkdir(leasePath);
    await writeFile(join(leasePath, "owner.json"), JSON.stringify({ pid: 2147483647, token: "stale", started: 1 }));
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => ProfileLease.acquire(path)));
    const owners = results.filter((result): result is PromiseFulfilledResult<ProfileLease> => result.status === "fulfilled");
    expect(owners).toHaveLength(1);
    await expect(ProfileLease.acquire(path)).rejects.toMatchObject({ code: "PROFILE_BUSY" });
    await owners[0]!.value.release();
    const next = await ProfileLease.acquire(path);
    await next.release();
  } finally { await rm(path, { recursive: true, force: true }); }
});
