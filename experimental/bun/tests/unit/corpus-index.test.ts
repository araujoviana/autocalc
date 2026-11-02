import { expect, test } from "bun:test";
import { corpusIndexEntry } from "../../scripts/corpus-index.ts";

test("corpus index entries preserve the Python metadata format", () => {
  expect(corpusIndexEntry({ id: "abc", name: "Example", updated: "date", total: { amount: 12 } })).toEqual({ key: "abc", name: "Example", updateTime: "date", totalPrice: { amount: 12 } });
  expect(corpusIndexEntry({ id: "abc" })).toEqual({ key: "abc", name: null, updateTime: null, totalPrice: null });
});
