export const TARGET_REGIONS = ["sa-brazil-1", "la-south-2"] as const;
export type TargetRegion = (typeof TARGET_REGIONS)[number];

export const EXCLUDED_SERVICES = [
  "aad",
  "cc",
  "dbss",
  "dsc",
  "edgesec",
  "esw",
  "ga",
  "hecs",
  "reliability",
  "ssa",
  "ucs",
] as const;

export const EXCLUDED_CONFIGURATIONS = [
  "windows_guest",
  "private_nat",
  "rocketmq",
  "aws",
] as const;

export type EvidenceStatus =
  | "verified"
  | "failed"
  | "unverified"
  | "blocked"
  | "unavailable"
  | "excluded"
  | "portal_defect";

export interface EvidenceMetadata {
  implemented: boolean;
  replay?: EvidenceStatus;
  rating?: EvidenceStatus;
  publication?: EvidenceStatus;
  timestamp?: string;
  version?: string;
  reason?: string;
  blocker?: string;
}

export interface CoverageCase {
  region: TargetRegion | string;
  service: string;
  variant?: string;
  billing?: string;
  options?: Record<string, unknown>;
  evidence: EvidenceMetadata;
  excluded?: boolean;
  exclusionReason?: string;
}

export interface RegionStats {
  total: number;
  scoped: number;
  implemented: number;
  replayVerified: number;
  ratingVerified: number;
  publicationVerified: number;
  excluded: number;
  unavailable: number;
  blocked: number;
  portalDefect: number;
  failed: number;
}

export interface CoverageSummary {
  total: number;
  scoped: number;
  implemented: number;
  replayVerified: number;
  ratingVerified: number;
  publicationVerified: number;
  excluded: number;
  unavailable: number;
  blocked: number;
  portalDefect: number;
  failed: number;
  byRegion: Record<string, RegionStats>;
}

function emptyRegionStats(): RegionStats {
  return {
    total: 0,
    scoped: 0,
    implemented: 0,
    replayVerified: 0,
    ratingVerified: 0,
    publicationVerified: 0,
    excluded: 0,
    unavailable: 0,
    blocked: 0,
    portalDefect: 0,
    failed: 0,
  };
}

export function calculateCoverage(cases: CoverageCase[]): CoverageSummary {
  const byRegion: Record<string, RegionStats> = {};
  const global = emptyRegionStats();

  for (const c of cases) {
    const reg = c.region;
    if (!byRegion[reg]) {
      byRegion[reg] = emptyRegionStats();
    }
    const rStat = byRegion[reg];

    rStat.total++;
    global.total++;

    if (c.excluded) {
      rStat.excluded++;
      global.excluded++;
      continue;
    }

    rStat.scoped++;
    global.scoped++;

    if (c.evidence.implemented) {
      rStat.implemented++;
      global.implemented++;
    }

    if (c.evidence.replay === "verified") {
      rStat.replayVerified++;
      global.replayVerified++;
    } else if (c.evidence.replay === "failed") {
      rStat.failed++;
      global.failed++;
    }

    if (c.evidence.rating === "verified") {
      rStat.ratingVerified++;
      global.ratingVerified++;
    }

    if (c.evidence.publication === "verified") {
      rStat.publicationVerified++;
      global.publicationVerified++;
    }

    if (c.evidence.replay === "unavailable" || c.evidence.rating === "unavailable" || c.evidence.publication === "unavailable") {
      rStat.unavailable++;
      global.unavailable++;
    }

    if (c.evidence.replay === "blocked" || c.evidence.rating === "blocked" || c.evidence.publication === "blocked" || c.evidence.blocker) {
      rStat.blocked++;
      global.blocked++;
    }

    if (c.evidence.replay === "portal_defect" || c.evidence.publication === "portal_defect") {
      rStat.portalDefect++;
      global.portalDefect++;
    }
  }

  return {
    ...global,
    byRegion,
  };
}

export function renderCoverage(cases: CoverageCase[]): string {
  const stats = calculateCoverage(cases);
  const dateStr = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `# Regional Configuration Coverage Report (${dateStr})`,
    "",
    "## Summary (Truthful Denominators)",
    "",
    "| Region | Scoped | Implemented | Replay | Rating | Publication | Unavailable | Blocked | Excluded |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const [region, rStat] of Object.entries(stats.byRegion)) {
    lines.push(
      `| ${region} | ${rStat.scoped} | ${rStat.implemented} | ${rStat.replayVerified} | ${rStat.ratingVerified} | ${rStat.publicationVerified} | ${rStat.unavailable} | ${rStat.blocked} | ${rStat.excluded} |`
    );
  }

  lines.push(
    `| **Total** | **${stats.scoped}** | **${stats.implemented}** | **${stats.replayVerified}** | **${stats.ratingVerified}** | **${stats.publicationVerified}** | **${stats.unavailable}** | **${stats.blocked}** | **${stats.excluded}** |`
  );
  lines.push("");

  const scopedCases = cases.filter((c) => !c.excluded);
  const excludedCases = cases.filter((c) => c.excluded);

  lines.push("## In-Scope Configuration Evidence");
  lines.push("");
  lines.push("| Region | Service | Variant | Billing | Implemented | Replay | Rating | Publication | Detail / Blocker |");
  lines.push("|---|---|---|---|---|---|---|---|---|");

  for (const c of scopedCases) {
    const detail = c.evidence.blocker ?? c.evidence.reason ?? (c.options ? JSON.stringify(c.options) : "");
    lines.push(
      `| ${c.region} | ${c.service} | ${c.variant ?? "-"} | ${c.billing ?? "-"} | ${c.evidence.implemented ? "yes" : "no"} | ${c.evidence.replay ?? "unverified"} | ${c.evidence.rating ?? "unverified"} | ${c.evidence.publication ?? "unverified"} | ${detail.replace(/\|/g, "/")} |`
    );
  }

  if (excludedCases.length > 0) {
    lines.push("");
    lines.push("## Explicitly Excluded Configurations");
    lines.push("");
    lines.push("| Region | Service | Variant | Reason |");
    lines.push("|---|---|---|---|");
    for (const c of excludedCases) {
      lines.push(
        `| ${c.region} | ${c.service} | ${c.variant ?? "-"} | ${c.exclusionReason ?? "Excluded by policy"} |`
      );
    }
  }

  return lines.join("\n");
}
