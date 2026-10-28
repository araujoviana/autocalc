export type ErrorCode = "AUTOCALC" | "VALIDATION" | "SPEC_NOT_FOUND" | "SERVICE_NOT_SOLD" |
  "MODE_NOT_OFFERED" | "REGION_NOT_FOUND" | "REGION_AMBIGUOUS" | "AUTH_REQUIRED" |
  "AUTH_EXPIRED" | "AUTH_LOGIN_FAILED" | "UPSTREAM" | "UNEXPECTED_RESPONSE" |
  "PAYLOAD_TOO_LARGE" | "PROFILE_BUSY" | "CANCELLED" | "BROWSER_UNAVAILABLE" | "MUTATION_UNKNOWN";

export class CalculatorError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly hint?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CalculatorError";
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
