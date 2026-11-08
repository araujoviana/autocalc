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

function isZodError(err: unknown): err is { issues: Array<{ path: (string | number)[]; message: string }> } {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === "ZodError" && Array.isArray((err as { issues?: unknown }).issues);
}

function isSystemError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string";
}

export function normalizeError(err: unknown): CalculatorError {
  if (err instanceof CalculatorError) return err;

  if (isZodError(err)) {
    const first = err.issues[0];
    const path = first?.path.length ? first.path.join(".") : undefined;
    const msg = first ? `${path ? `${path}: ` : ""}${first.message}` : "Validation failed";
    return new CalculatorError(
      "VALIDATION",
      msg,
      "Check option names, argument types, and required fields.",
      { issues: err.issues },
    );
  }

  if (isSystemError(err)) {
    const code = err.code;
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
      return new CalculatorError(
        "UPSTREAM",
        "Could not connect to remote service",
        "Check internet connectivity, DNS, and proxy/firewall settings.",
        { code },
      );
    }
    const target = err.path ? `'${err.path}'` : "File or path";
    if (err.code === "ENOENT") {
      return new CalculatorError(
        "VALIDATION",
        `${target} not found`,
        "Verify that the file path is correct and the file exists, or create a quote.yaml file.",
        { code: "ENOENT", path: err.path, syscall: err.syscall },
      );
    }
    if (err.code === "EACCES" || err.code === "EPERM") {
      return new CalculatorError(
        "AUTOCALC",
        `Permission denied accessing ${target}`,
        "Check filesystem permissions and try again.",
        { code: err.code, path: err.path },
      );
    }
    if (err.code === "ENOSPC") {
      return new CalculatorError(
        "AUTOCALC",
        "No disk space left on device",
        "Free up disk space and try again.",
        { code: "ENOSPC" },
      );
    }
    return new CalculatorError(
      "AUTOCALC",
      `System I/O error (${err.code}): ${err.message}`,
      undefined,
      { code: err.code, path: err.path },
    );
  }

  if (err instanceof Error) {
    const msg = err.message || "";
    if (msg.includes("Executable doesn't exist") || msg.includes("browserType.launch")) {
      return new CalculatorError(
        "BROWSER_UNAVAILABLE",
        "Chromium browser binary was not found or failed to start",
        "Run 'autocalc install-browser' to download the pinned Chromium browser build.",
      );
    }
    if (err.name === "TargetClosedError" || msg.includes("Target page, context or browser has been closed")) {
      return new CalculatorError(
        "CANCELLED",
        "Browser window or page was closed",
        "Keep the browser window open while automation is running.",
      );
    }
    if (err.name === "TimeoutError" || msg.includes("Timeout")) {
      return new CalculatorError(
        "UPSTREAM",
        "Browser operation timed out",
        "Check network connectivity or re-run with --headed to observe browser behavior.",
      );
    }

    const code = (err as { code?: string }).code;
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "EAI_AGAIN" || msg.includes("fetch failed")) {
      return new CalculatorError(
        "UPSTREAM",
        "Could not connect to remote service",
        "Check internet connectivity, DNS, and proxy/firewall settings.",
        { code },
      );
    }

    if (err instanceof SyntaxError || err.name === "YAMLParseError") {
      return new CalculatorError(
        "VALIDATION",
        `Syntax parsing failed: ${err.message}`,
        "Ensure the input or file contains valid YAML or JSON formatting.",
      );
    }

    return new CalculatorError(
      "AUTOCALC",
      err.message || "An unhandled error occurred",
      "Run 'autocalc doctor' or re-run with --headed to inspect.",
    );
  }

  return new CalculatorError("AUTOCALC", String(err) || "Unknown error");
}
