export type ErrorCode = "AUTOCALC" | "VALIDATION" | "SPEC_NOT_FOUND" | "SERVICE_NOT_SOLD" |
  "MODE_NOT_OFFERED" | "REGION_NOT_FOUND" | "REGION_AMBIGUOUS" | "AUTH_REQUIRED" |
  "AUTH_EXPIRED" | "AUTH_LOGIN_FAILED" | "UPSTREAM" | "UNEXPECTED_RESPONSE" |
  "PAYLOAD_TOO_LARGE" | "PROFILE_BUSY" | "CANCELLED" | "BROWSER_UNAVAILABLE" | "MUTATION_UNKNOWN" | "GATE_FAILED" | "PAGE_ENCODE_FAILED" | "UPDATE_FAILED";

/**
 * The one writing rule for error text (docs/reference/errors.md, "Writing errors"): a message or a hint is a sentence.
 * It starts with a capital letter and ends with a period (or ? or !). A multi-line message keeps its own layout.
 */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("\n")) return trimmed;
  const capitalized = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export class CalculatorError extends Error {
  readonly hint?: string;
  constructor(
    readonly code: ErrorCode,
    message: string,
    hint?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(sentence(message));
    this.name = "CalculatorError";
    if (hint !== undefined) this.hint = sentence(hint);
  }

  toJSON(): { error: ErrorCode; message: string; hint?: string; details?: Record<string, unknown> } {
    return { error: this.code, message: this.message,
      ...(this.hint === undefined ? {} : { hint: this.hint }),
      ...(this.details === undefined ? {} : { details: this.details }) };
  }
}

export function mapUpstreamError(exceptionId: string): CalculatorError {
  const details = { exceptionId };
  if (exceptionId === "CBC.0101") return new CalculatorError("AUTH_EXPIRED", "Authentication expired", undefined, details);
  if (["CBC.0102", "CBC.6006", "CBC.6008"].includes(exceptionId))
    return new CalculatorError("SPEC_NOT_FOUND", "Specification not found", undefined, details);
  if (exceptionId === "CBC.6050") return new CalculatorError("UPSTREAM", "Calculator rejected the product pricing configuration", "Check the usage factor, capacity, and measure unit.", details);
  if (exceptionId === "CBC.6001") return new CalculatorError("VALIDATION", "Invalid request", undefined, details);
  return new CalculatorError("UPSTREAM", "Upstream request failed", undefined, details);
}

/** The calculator page did not produce a card: a field, a value, the price or the capture failed. */
export function pageEncodeFailed(message: string, info: { service: string; step?: string | undefined; field?: string | undefined; frontendVersion?: string | undefined; hint?: string }): CalculatorError {
  const details: Record<string, unknown> = { service: info.service };
  if (info.step) details.step = info.step;
  if (info.field) details.field = info.field;
  if (info.frontendVersion) details.frontend_version = info.frontendVersion;
  return new CalculatorError("PAGE_ENCODE_FAILED", message, info.hint ?? "Re-run with AUTOCALC_PAGE_HEADED=1 to watch the calculator page.", details);
}
