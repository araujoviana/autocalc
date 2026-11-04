import { expect, test } from "bun:test";
import { roundPython } from "../../src/core/rounding.ts";
test("rounding respects binary floating point and ties to even", () => {
  expect(roundPython(2.675, 2)).toBe(2.67);
  expect(roundPython(2.5, 0)).toBe(2);
  expect(roundPython(3.5, 0)).toBe(4);
  expect(roundPython(-2.5, 0)).toBe(-2);
  expect(roundPython(0, 6)).toBe(0);
});
