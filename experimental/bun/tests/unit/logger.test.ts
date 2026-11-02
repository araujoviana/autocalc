import { expect, test } from "bun:test";
import { redact } from "../../src/core/logger.ts";

test("redacts credentials in diagnostic text", () => {
  const value = redact("Cookie: session=secret\ncsrf=private token: bearer-value");
  expect(value).not.toContain("secret");
  expect(value).not.toContain("private");
  expect(value).not.toContain("bearer-value");
  expect(redact('{"csrf":"private","token":"secret"}')).not.toContain("private");
  expect(redact('{"csrf":"private","token":"secret"}')).not.toContain("secret");
});
