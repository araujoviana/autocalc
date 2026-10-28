import { expect, test } from "bun:test";
import { endpoints, shareLink } from "../../src/core/endpoints.ts";

test("constructs calculator URLs with vendor service case and requested currency", () => {
  const product = new URL(endpoints.product("rabbitMQ", "sa-brazil-1"));
  expect(product.searchParams.get("urlPath")).toBe("rabbitMQ");
  expect(product.searchParams.get("region")).toBe("sa-brazil-1");
  expect(new URL(shareLink("abc123", "BRL")).searchParams.get("currentCurrency")).toBe("BRL");
});
