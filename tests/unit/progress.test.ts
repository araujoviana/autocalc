import { afterEach, expect, test } from "bun:test";
import { progress, setProgress } from "../../src/core/progress.ts";

afterEach(() => setProgress(null));

test("progress goes to the sink when one is set and nowhere otherwise", () => {
  const seen: string[] = [];
  progress("ignored");
  setProgress(message => seen.push(message));
  progress("a");
  setProgress(null);
  progress("b");
  expect(seen).toEqual(["a"]);
});

test("a throwing sink never fails the work", () => {
  setProgress(() => { throw new Error("closed pipe"); });
  expect(() => progress("a")).not.toThrow();
});
