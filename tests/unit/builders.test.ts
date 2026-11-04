import { expect, test } from "bun:test";
import { supportedServices } from "../../src/core/services/index.ts";
test("service registry includes all 51 builders and recipes with vendor-compatible modes", () => {
  const services = supportedServices();
  expect(services).toHaveLength(51);
  expect(services.find(item => item.service === "ecs")?.modes).toEqual(["monthly", "yearly", "ondemand"]);
  expect(services.find(item => item.service === "eip")?.modes).toEqual(["monthly", "yearly", "ondemand"]);
  expect(services.map(item => item.service)).toContain("rabbitmq");
});
