/** Exact decimals for catalog prices (Python's Decimal): value = n / 10^s. Only what ranking needs. */
export interface Dec { n: bigint; s: number }

export function parseDecimal(text: string): Dec {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new RangeError(`Not a decimal: ${text}`);
  const frac = m[3] ?? "", exp = Number(m[4] ?? 0);
  let n = BigInt((m[2] || "0") + frac), s = frac.length - exp;
  if (s < 0) { n *= 10n ** BigInt(-s); s = 0; }
  return { n: m[1] === "-" ? -n : n, s };
}

const align = (a: Dec, b: Dec): [bigint, bigint, number] => {
  const s = Math.max(a.s, b.s);
  return [a.n * 10n ** BigInt(s - a.s), b.n * 10n ** BigInt(s - b.s), s];
};
export function compareDecimal(a: Dec, b: Dec): number { const [x, y] = align(a, b); return x < y ? -1 : x > y ? 1 : 0; }
export function subDecimal(a: Dec, b: Dec): Dec { const [x, y, s] = align(a, b); return { n: x - y, s }; }

/** Plain notation without trailing zeros, like Python's format(d.normalize(), "f"). */
export function formatDecimal(d: Dec): string {
  let { n, s } = d;
  while (s > 0 && n % 10n === 0n) { n /= 10n; s--; }
  const sign = n < 0n ? "-" : "", digits = (n < 0n ? -n : n).toString().padStart(s + 1, "0");
  return s === 0 ? sign + digits : `${sign}${digits.slice(0, -s)}.${digits.slice(-s)}`;
}
