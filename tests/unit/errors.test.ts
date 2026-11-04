import { expect, test } from "bun:test";
import { CalculatorError, mapUpstreamError, sentence } from "../../src/core/errors.ts";

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
