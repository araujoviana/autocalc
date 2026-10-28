import type { z } from "zod";
import { BrowserOptions } from "./schemas.ts";
import { homedir } from "node:os";
import { join } from "node:path";
import { validateProfile } from "./session-store.ts";
export type BrowserOptionsInput = z.input<typeof BrowserOptions>;

export function resolveConfig(options: BrowserOptionsInput = {}, env: Record<string, string | undefined> = process.env) {
  return BrowserOptions.parse({ ...options, profile: options.profile ?? env.AUTOCALC_PROFILE ?? "default",
    ...(options.executable === undefined && env.AUTOCALC_BROWSER ? { executable: env.AUTOCALC_BROWSER } : {}) });
}
export function profilePaths(profile: string, env: Record<string, string | undefined> = process.env) {
  validateProfile(profile);
  const configDir = env.AUTOCALC_CONFIG ?? join(homedir(), ".config", "autocalc");
  const dataDir = env.AUTOCALC_DATA ?? join(homedir(), ".local", "share", "autocalc");
  return { configDir, profileDir: join(dataDir, profile === "default" ? "browser-profile" : `browser-profile-${profile}`) };
}
