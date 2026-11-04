import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CalculatorError } from "./errors.ts";

const metadata = z.object({ pid: z.number().int().positive(), token: z.string(), started: z.number() });

async function reapDeadLease(path: string, owner: z.output<typeof metadata>): Promise<boolean> {
  const reaper = `${path}.reap`;
  try { await mkdir(reaper, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    let current: z.output<typeof metadata>;
    try { current = metadata.parse(JSON.parse(await readFile(join(path, "owner.json"), "utf8")) as unknown); }
    catch { return false; }
    if (current.token !== owner.token || current.pid !== owner.pid) return false;
    try { process.kill(current.pid, 0); return false; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") return false;
      await rm(path, { recursive: true, force: true });
      return true;
    }
  } finally { await rm(reaper, { recursive: true, force: true }); }
}

export class ProfileLease {
  private constructor(private readonly path: string, private readonly token: string) {}
  static async acquire(profilePath: string): Promise<ProfileLease> {
    await mkdir(profilePath, { recursive: true, mode: 0o700 });
    const path = join(profilePath, ".autocalc-lease");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await mkdir(path, { mode: 0o700 });
        const token = randomUUID();
        try { await writeFile(join(path, "owner.json"), JSON.stringify({ pid: process.pid, token, started: Date.now() }), { mode: 0o600 }); }
        catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
        return new ProfileLease(path, token);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let owner: z.output<typeof metadata>;
        try { owner = metadata.parse(JSON.parse(await readFile(join(path, "owner.json"), "utf8")) as unknown); }
        catch { throw new CalculatorError("PROFILE_BUSY", "Profile lease cannot be verified", "Wait for the owner or inspect the lease manually."); }
        try { process.kill(owner.pid, 0); }
        catch (probe) {
          if ((probe as NodeJS.ErrnoException).code === "ESRCH" && await reapDeadLease(path, owner)) continue;
        }
        throw new CalculatorError("PROFILE_BUSY", "Profile is already in use", "Close the other autocalc process first.");
      }
    }
    throw new CalculatorError("PROFILE_BUSY", "Could not acquire profile lease");
  }
  async release(): Promise<void> {
    try {
      const owner = metadata.parse(JSON.parse(await readFile(join(this.path, "owner.json"), "utf8")) as unknown);
      if (owner.token === this.token) await rm(this.path, { recursive: true, force: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
