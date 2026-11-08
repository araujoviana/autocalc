import { expect, test } from "bun:test";
import { main, parseItem, quoteWithConversion, playwrightCliPath } from "../../src/cli.ts";
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
  expect(parseItem("ecs:c7n.large.2.linux*3")).toEqual({ service: "ecs", spec: "c7n.large.2.linux", quantity: 3 });
  expect(parseItem("ecs:SSD@100")).toEqual({ service: "ecs", spec: "SSD", quantity: 1, size: 100 });
  expect(parseItem("ecs:SSD*3@100")).toEqual({ service: "ecs", spec: "SSD", quantity: 3, size: 100 });
  expect(() => parseItem("nonsense")).toThrow();
  expect(() => parseItem("bad input")).toThrow();
});

test("auth import is gone", async () => {
  const origWrite = process.stderr.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    expect(await main(["node", "autocalc", "auth", "import"])).not.toBe(0);
  } finally {
    process.stderr.write = origWrite;
  }
});

test("CLI login defaults to 300s timeout", async () => {
  const { toolOverrides } = await import("../../src/cli.ts");
  let capturedInput: Record<string, unknown> | undefined;
  toolOverrides["auth_login"] = async input => {
    capturedInput = input;
    return { logged_in: true, profile: "default" };
  };
  try {
    const code = await main(["node", "autocalc", "login"]);
    expect(code).toBe(0);
    expect(capturedInput).toEqual({ timeout: 300 });
  } finally {
    delete toolOverrides["auth_login"];
  }
});
