import { expect, test } from "bun:test";
import { mapUpstreamError } from "../../src/core/errors.ts";

test("maps vendor authentication and catalog codes without exposing bodies", () => {
  expect(mapUpstreamError("CBC.0101").toJSON()).toEqual({
    error: "AUTH_EXPIRED", message: "Authentication expired", details: { exceptionId: "CBC.0101" },
  });
  expect(mapUpstreamError("CBC.6006").code).toBe("SPEC_NOT_FOUND");
  expect(mapUpstreamError("CBC.6001").code).toBe("VALIDATION");
  expect(mapUpstreamError("CBC.9999").code).toBe("UPSTREAM");
});
