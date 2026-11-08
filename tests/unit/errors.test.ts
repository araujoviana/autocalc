import { expect, test } from "bun:test";
import { CalculatorError, mapUpstreamError, normalizeError, sentence } from "../../src/core/errors.ts";
import { z } from "zod";

test("maps vendor authentication and catalog codes without exposing bodies", () => {
  expect(mapUpstreamError("CBC.0101").toJSON()).toEqual({
    error: "AUTH_EXPIRED", message: "Authentication expired.", details: { exceptionId: "CBC.0101" },
  });
  expect(mapUpstreamError("CBC.6006").code).toBe("SPEC_NOT_FOUND");
  expect(mapUpstreamError("CBC.6001").code).toBe("VALIDATION");
  expect(mapUpstreamError("CBC.9999").code).toBe("UPSTREAM");
});

test("error text is a sentence: capital first letter, a final period, a multi-line message left alone", () => {
  expect(sentence("request cancelled")).toBe("Request cancelled.");
  expect(sentence("Already a sentence.")).toBe("Already a sentence.");
  expect(sentence("Is it? ")).toBe("Is it?");
  expect(sentence("Invalid spec:\n  bad field")).toBe("Invalid spec:\n  bad field");
  const error = new CalculatorError("VALIDATION", "limit must be a number", "use a number");
  expect([error.message, error.hint]).toEqual(["Limit must be a number.", "Use a number."]);
  expect(new CalculatorError("VALIDATION", "x is bad").hint).toBeUndefined();
});

test("normalizeError handles CalculatorError and converts all foreign error types", () => {
  // 1. CalculatorError pass-through
  const orig = new CalculatorError("VALIDATION", "Original error");
  expect(normalizeError(orig)).toBe(orig);

  // 2. ZodError
  const schema = z.object({ count: z.number() });
  const zodResult = schema.safeParse({ count: "not-a-number" });
  if (!zodResult.success) {
    const norm = normalizeError(zodResult.error);
    expect(norm.code).toBe("VALIDATION");
    expect(norm.message.toLowerCase()).toContain("count");
    expect(norm.hint).toBeDefined();
  }

  // 3. SystemError (ENOENT)
  const enoent = Object.assign(new Error("no such file"), { code: "ENOENT", path: "missing.yaml" });
  const normEnoent = normalizeError(enoent);
  expect(normEnoent.code).toBe("VALIDATION");
  expect(normEnoent.message).toContain("'missing.yaml' not found");
  expect(normEnoent.hint).toContain("Verify that the file path is correct");

  // 4. SystemError (EACCES)
  const eacces = Object.assign(new Error("denied"), { code: "EACCES", path: "secret.txt" });
  const normEacces = normalizeError(eacces);
  expect(normEacces.code).toBe("AUTOCALC");
  expect(normEacces.message).toContain("Permission denied");

  // 5. Playwright missing browser
  const browserErr = new Error("Executable doesn't exist at /path/to/chromium");
  const normBrowser = normalizeError(browserErr);
  expect(normBrowser.code).toBe("BROWSER_UNAVAILABLE");
  expect(normBrowser.hint).toContain("autocalc install-browser");

  // 6. TargetClosedError
  const targetClosed = Object.assign(new Error("Target page, context or browser has been closed"), { name: "TargetClosedError" });
  const normTarget = normalizeError(targetClosed);
  expect(normTarget.code).toBe("CANCELLED");

  // 7. Network error
  const netErr = Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" });
  const normNet = normalizeError(netErr);
  expect(normNet.code).toBe("UPSTREAM");
  expect(normNet.hint).toContain("internet connectivity");

  // 8. Syntax error
  const syntaxErr = new SyntaxError("Unexpected token in JSON");
  const normSyntax = normalizeError(syntaxErr);
  expect(normSyntax.code).toBe("VALIDATION");
  expect(normSyntax.hint).toContain("valid YAML or JSON");
});
