import { expect, test } from "bun:test";
import { supportedServices } from "../../src/core/services/index.ts";
test("service registry includes all 22 required builders with vendor-compatible modes", () => {
  const services = supportedServices();
  expect(services).toHaveLength(22);
  expect(services.find(item => item.service === "ecs")?.modes).toContain("ri");
  expect(services.find(item => item.service === "eip")?.modes).toEqual(["ondemand"]);
  expect(services.map(item => item.service)).toContain("rabbitmq");
});
