/** Match Python's round(float, digits) for the finite values used in calculator totals. */
export function roundPython(value: number, digits: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(digits) || digits < 0 || digits > 15) throw new RangeError("Invalid rounding input");
  if (value === 0) return value;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value), false);
  const bits = view.getBigUint64(0, false), exponent = Number((bits >> 52n) & 0x7ffn), fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent === 0 ? fraction : (1n << 52n) | fraction;
  const power = exponent === 0 ? -1074 : exponent - 1023 - 52;
  const factor = 10n ** BigInt(digits);
  let numerator = mantissa * factor, denominator = 1n;
  if (power >= 0) numerator <<= BigInt(power); else denominator <<= BigInt(-power);
  let quotient = numerator / denominator;
  const remainder = numerator % denominator, doubled = remainder * 2n;
  if (doubled > denominator || (doubled === denominator && quotient % 2n !== 0n)) quotient++;
  const result = Number(`${quotient}e-${digits}`);
  return value < 0 ? -result : result;
}
