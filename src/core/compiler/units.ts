/** Physical Dimensional Unit Parser.
 * Enforces explicit units for capacity, bandwidth, traffic, and durations.
 * Prevents catastrophic 1,000x unit misinterpretations (e.g., bare numbers in OBS). */
import { CalculatorError } from "../errors.ts";

export interface ParsedCapacity {
  raw: string;
  amount: number;
  unit: string;
  inGB: number;
  inBytes: number;
}

export interface ParsedBandwidth {
  raw: string;
  amount: number;
  unit: string;
  inMbps: number;
}

export interface ParsedTraffic {
  raw: string;
  amount: number;
  unit: string;
  inGBPerMonth: number;
}

export interface ParsedDuration {
  raw: string;
  amount: number;
  unit: string;
  inHours: number;
  inDays: number;
  inMonths: number;
}

export interface ParsedRequestRate {
  raw: string;
  amount: number;
  unit: string;
  perMonth: number;
}

const CAPACITY_UNITS: Record<string, number> = {
  // Base bytes
  b: 1,
  byte: 1,
  bytes: 1,
  // Binary prefixes (standard IEC)
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
  pib: 1024 ** 5,
  // Decimal / Common cloud prefixes (standardized to 1024 base for cloud storage allocation)
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
  pb: 1024 ** 5,
};

const BANDWIDTH_UNITS: Record<string, number> = {
  "bit/s": 1e-6,
  bps: 1e-6,
  "kbit/s": 1e-3,
  kbps: 1e-3,
  "mbit/s": 1,
  mbps: 1,
  "gbit/s": 1e3,
  gbps: 1e3,
  "tbit/s": 1e6,
  tbps: 1e6,
};

const DURATION_HOURS: Record<string, number> = {
  h: 1,
  hr: 1,
  hour: 1,
  hours: 1,
  d: 24,
  day: 24,
  days: 24,
  mo: 730,
  mon: 730,
  month: 730,
  months: 730,
  y: 8760,
  yr: 8760,
  year: 8760,
  years: 8760,
};

function splitUnit(val: unknown, fieldName: string, allowedExample: string): { amount: number; unitStr: string } {
  if (typeof val === "number") {
    throw new CalculatorError(
      "VALIDATION",
      `Field '${fieldName}' requires an explicit dimensional unit (e.g. '${val} ${allowedExample}'). Bare numbers are forbidden to prevent unit ambiguity.`
    );
  }

  if (typeof val !== "string" || !val.trim()) {
    throw new CalculatorError("VALIDATION", `Field '${fieldName}' must be a string with a number and unit (e.g. '${allowedExample}').`);
  }

  const match = val.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z/%_-]+)$/);
  if (!match) {
    throw new CalculatorError(
      "VALIDATION",
      `Cannot parse dimensional value '${val}' for '${fieldName}'. Expected format like '${allowedExample}'.`
    );
  }

  const amount = parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new CalculatorError("VALIDATION", `Field '${fieldName}' must specify a finite non-negative number.`);
  }

  return { amount, unitStr: match[2]!.trim() };
}

/** Parses digital storage capacity into GB and bytes (e.g. '100 GB', '500 GiB', '2 TB'). */
export function parseCapacity(val: unknown, fieldName = "capacity"): ParsedCapacity {
  const { amount, unitStr } = splitUnit(val, fieldName, "GB");
  const normalized = unitStr.toLowerCase();
  const mult = CAPACITY_UNITS[normalized];

  if (mult === undefined) {
    const legal = Object.keys(CAPACITY_UNITS).filter(u => u.length <= 3).map(u => u.toUpperCase());
    throw new CalculatorError(
      "VALIDATION",
      `Unknown capacity unit '${unitStr}' for '${fieldName}'. Allowed units include: ${Array.from(new Set(legal)).join(", ")}.`
    );
  }

  const inBytes = amount * mult;
  const inGB = inBytes / (1024 ** 3);

  return {
    raw: String(val).trim(),
    amount,
    unit: unitStr,
    inGB,
    inBytes,
  };
}

/** Parses bandwidth into Mbps (e.g. '10 Mbit/s', '100 Mbps', '1 Gbps'). */
export function parseBandwidth(val: unknown, fieldName = "bandwidth"): ParsedBandwidth {
  const { amount, unitStr } = splitUnit(val, fieldName, "Mbit/s");
  const normalized = unitStr.toLowerCase();
  const mult = BANDWIDTH_UNITS[normalized];

  if (mult === undefined) {
    throw new CalculatorError(
      "VALIDATION",
      `Unknown bandwidth unit '${unitStr}' for '${fieldName}'. Allowed units include: Mbit/s, Mbps, Gbit/s, Gbps, kbit/s, kbps.`
    );
  }

  return {
    raw: String(val).trim(),
    amount,
    unit: unitStr,
    inMbps: amount * mult,
  };
}

/** Parses periodic data traffic into GB/month (e.g. '150 TB/mo', '500 GB/month', '10 TB'). */
export function parseTraffic(val: unknown, fieldName = "traffic"): ParsedTraffic {
  if (typeof val === "number") {
    throw new CalculatorError(
      "VALIDATION",
      `Field '${fieldName}' requires an explicit dimensional unit (e.g. '${val} GB/mo' or '${val} TB'). Bare numbers are forbidden.`
    );
  }
  if (typeof val !== "string" || !val.trim()) {
    throw new CalculatorError("VALIDATION", `Field '${fieldName}' must be a string with a volume unit (e.g. '100 GB/mo').`);
  }

  // Handle optional period suffix /mo, /month, /m
  let cleaned = val.trim();
  const periodMatch = cleaned.match(/^(.+?)\s*\/\s*(?:mo|month|m)$/i);
  if (periodMatch) {
    cleaned = periodMatch[1]!.trim();
  }

  const cap = parseCapacity(cleaned, fieldName);
  return {
    raw: String(val).trim(),
    amount: cap.amount,
    unit: cap.unit,
    inGBPerMonth: cap.inGB,
  };
}

/** Parses time and duration into hours, days, and months (e.g. '730 h', '30 days', '1 y'). */
export function parseDuration(val: unknown, fieldName = "duration"): ParsedDuration {
  const { amount, unitStr } = splitUnit(val, fieldName, "h");
  const normalized = unitStr.toLowerCase();
  const hoursPerUnit = DURATION_HOURS[normalized];

  if (hoursPerUnit === undefined) {
    throw new CalculatorError(
      "VALIDATION",
      `Unknown duration unit '${unitStr}' for '${fieldName}'. Allowed units include: h, hour, d, day, mo, month, y, year.`
    );
  }

  const inHours = amount * hoursPerUnit;
  const inDays = inHours / 24;
  const inMonths = inHours / 730;

  return {
    raw: String(val).trim(),
    amount,
    unit: unitStr,
    inHours,
    inDays,
    inMonths,
  };
}

/** Parses request counts into total requests per month (e.g. '50000', '50k', '10M', '50k/mo'). */
export function parseRequestRate(val: unknown, fieldName = "requests"): ParsedRequestRate {
  if (typeof val === "number") {
    if (!Number.isFinite(val) || val < 0) {
      throw new CalculatorError("VALIDATION", `Field '${fieldName}' must specify a finite non-negative number.`);
    }
    return {
      raw: String(val),
      amount: val,
      unit: "count",
      perMonth: val,
    };
  }

  if (typeof val !== "string" || !val.trim()) {
    throw new CalculatorError("VALIDATION", `Field '${fieldName}' must specify a number or formatted rate (e.g. 50000 or '50k/mo').`);
  }

  let cleaned = val.trim();
  const periodMatch = cleaned.match(/^(.+?)\s*\/\s*(?:mo|month|m)$/i);
  if (periodMatch) {
    cleaned = periodMatch[1]!.trim();
  }

  const match = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kKmMbB]?)$/);
  if (!match) {
    throw new CalculatorError("VALIDATION", `Cannot parse request rate '${val}' for '${fieldName}'. Expected number or '50k', '10M'.`);
  }

  const amount = parseFloat(match[1]!);
  const suffix = match[2]!.toLowerCase();
  let multiplier = 1;
  if (suffix === "k") multiplier = 1_000;
  else if (suffix === "m") multiplier = 1_000_000;
  else if (suffix === "b") multiplier = 1_000_000_000;

  const perMonth = amount * multiplier;
  return {
    raw: String(val).trim(),
    amount,
    unit: suffix ? suffix.toUpperCase() : "count",
    perMonth,
  };
}
