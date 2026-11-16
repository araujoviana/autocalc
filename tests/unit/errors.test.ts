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

test("zodValidationError flattens union issues and formatMcpError maps CLI hints to MCP tools", async () => {
  const { zodValidationError } = await import("../../src/core/errors.ts");
  const { formatMcpError, shapeMcpResult } = await import("../../src/mcp.ts");
  const { Numeric } = await import("../../src/core/schemas.ts");

  const parsed = z.object({ quantity: Numeric }).safeParse({ quantity: "bad" });
  expect(parsed.success).toBe(false);
  if (!parsed.success) {
    const err = zodValidationError(parsed.error);
    expect(err.message).toContain("quantity");
    expect(err.details?.issues).toEqual([{ path: "quantity", message: expect.any(String) }]);
  }

  const authErr = JSON.parse(formatMcpError(new CalculatorError("AUTH_EXPIRED", "Session expired", "Run 'autocalc login'")).content[0]!.text);
  expect(authErr.hint).toContain("auth_login");
  expect(authErr.hint).not.toContain("autocalc login");

  const specErr = JSON.parse(formatMcpError(new CalculatorError("SPEC_NOT_FOUND", "No spec")).content[0]!.text);
  expect(specErr.hint).toContain("search_skus");

  const shapedPlan = shapeMcpResult("plan_quote", {}, {
    draft_id: "d-1",
    cards: [{ id: "c1", unmapped_options: [], spec: "s1" }],
    pending: [],
    shards: [{ index: 0, title: "Part 1", cardCount: 1, estimatedBytes: 100, resources: [{ huge: true }] }],
  }) as Record<string, any>;
  expect(shapedPlan.cards[0]).not.toHaveProperty("unmapped_options");
  expect(shapedPlan.shards[0]).toEqual({ index: 0, title: "Part 1", cardCount: 1, estimatedBytes: 100 });

  const shapedApply = shapeMcpResult("apply_quote", {}, {
    name: "Prod",
    id: "L1",
    url: "u1",
    urls: ["u1", "u2"],
    checks: [{ index: 0, title: "c1", ok: true }],
    shards: [
      { index: 0, title: "Prod - Part 1", id: "L1", url: "u1", cardCount: 1, checks: [{ index: 0, title: "c1", ok: true }] },
      { index: 1, title: "Prod - Part 2", id: "L2", url: "u2", cardCount: 1, checks: [{ index: 0, title: "c2", ok: false, problems: ["mismatch"] }] },
    ],
  }) as Record<string, any>;
  expect(shapedApply).not.toHaveProperty("urls");
  expect(shapedApply).not.toHaveProperty("checks");
  expect(shapedApply.shards[0]).toEqual({ index: 0, title: "Prod - Part 1", id: "L1", url: "u1", cardCount: 1, verified_cards: 1 });
  expect(shapedApply.shards[1].checks).toHaveLength(1);
});
