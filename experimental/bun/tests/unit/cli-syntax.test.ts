import { expect, test } from "bun:test";
import { parseItem, quoteWithConversion, playwrightCliPath } from "../../src/cli.ts";
import { isAbsolute } from "node:path";

test("browser installer resolves the local Playwright CLI independently of the working directory", async () => {
  expect(isAbsolute(playwrightCliPath())).toBe(true);
  expect(await Bun.file(playwrightCliPath()).exists()).toBe(true);
});

test("quote currency output retains the Python converted field", async () => {
  const quote = { total: 10 };
  expect(await quoteWithConversion(quote, "brl", async () => ({ usd: 10, currency: "BRL", rate: 5, amount: 50 }))).toEqual({ total: 10, converted: { currency: "BRL", rate: 5, total: 50 } });
  expect(await quoteWithConversion(quote, "USD", async () => ({ usd: 10, currency: "USD", rate: 1, amount: 10 }))).toEqual({ total: 10, converted: { currency: "USD", rate: 1, total: 10 } });
  expect(await quoteWithConversion(quote, "XXX", async () => ({ error: "no rate", available: [] }))).toEqual({ total: 10, converted: { currency: "XXX", rate: null, total: null } });
});
test("parses quote item quantity and size", () => {
  expect(parseItem("ecs:SSD*3@100")).toEqual({ service: "ecs", spec: "SSD", quantity: 3, size: 100 });
  expect(() => parseItem("bad input")).toThrow();
});
