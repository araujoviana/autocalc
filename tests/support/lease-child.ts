import { ProfileLease } from "../../src/core/profile-lease.ts";
if (import.meta.main) {
  const path = process.argv[2];
  if (!path) throw new Error("Profile path is required");
  const lease = await ProfileLease.acquire(path);
  try {
    process.stdout.write("READY\n");
    process.stdin.resume();
    await new Promise<void>(resolve => process.stdin.once("end", () => resolve()));
  } finally { await lease.release(); }
}
