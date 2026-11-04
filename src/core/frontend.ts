/** The calculator's frontend version, and whether a service was verified against it (`src/autocalc/frontend.py`). */

import { PAGE } from "./endpoints.ts";
import { VERIFIED, VERIFIED_FRONTEND } from "./services/publication.ts";

const RE = /CBC-PortalCalculator\/([0-9.]+)/;

export const VERIFIED_VERSIONS: Record<string, string> = Object.fromEntries(
  [...VERIFIED].map(s => [s, VERIFIED_FRONTEND]),
);

/** The version the live calculator page loads, or undefined when it cannot be read. */
export async function liveVersion(fetchFn: typeof fetch = fetch): Promise<string | undefined> {
  try {
    const res = await fetchFn(PAGE, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return undefined;
    return RE.exec(await res.text())?.[1];
  } catch {
    return undefined;
  }
}

/** One line per service verified on another frontend version than `live`. */
export function warnings(services: Iterable<string>, live: string | null | undefined): string[] {
  if (live === undefined || live === null) {
    return ["Could not read the calculator's frontend version; the publish gate still checks every card."];
  }
  return [...new Set(services)]
    .sort()
    .filter(s => VERIFIED_VERSIONS[s] !== live)
    .map(s => `${s} was verified on calculator frontend ${VERIFIED_VERSIONS[s]}, the live one is ${live}; the publish gate still checks every card.`);
}
