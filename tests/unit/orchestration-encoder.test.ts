import { expect, test } from "bun:test";
import { OrchestrationEncoder, type ExpectedResource } from "../support/orchestration-encoder.ts";

const resources: ExpectedResource[] = [
  { id: "hot", service: "obs", region: "sa-brazil-1", billing: "ondemand", quantity: 1, spec: "obs.001", options: { storage_class: "standard", components: [{ factor: "size", value: 100, unit: "GB" }] } },
  { id: "cold", service: "obs", region: "sa-brazil-1", billing: "ondemand", quantity: 1, spec: "obs.001", options: { storage_class: "cold", components: [{ factor: "size_cold", value: 200, unit: "TB" }] } },
];
const input = (resource: ExpectedResource) => ({ service: resource.service, region: resource.region, billing: resource.billing, quantity: resource.quantity, ...structuredClone(resource.options) });

test("same-service resources retain distinct configuration bindings when encode order changes", () => {
  const encoder = new OrchestrationEncoder();
  encoder.begin(resources);
  const hot = { template_RENDER: { class: "standard" } }, cold = { template_RENDER: { class: "cold" } };
  encoder.bind(input(resources[0]!), hot);
  encoder.bind(input(resources[1]!), cold);
  const coldCard = encoder.encode("obs", cold), hotCard = encoder.encode("obs", hot);
  expect(coldCard.selectedProduct._customTitle).toBe("cold");
  expect(hotCard.selectedProduct._customTitle).toBe("hot");
  expect(coldCard.rewriteValue).toEqual(cold);
  expect(hotCard.rewriteValue).toEqual(hot);
  expect(Object.keys(cold)).toEqual(["template_RENDER"]);
  encoder.assertComplete();
});

test("nested capacity and unit changes cannot bind another resource with the same service and SKU", () => {
  for (const changed of [{ factor: "size_cold", value: 999, unit: "TB" }, { factor: "size_cold", value: 200, unit: "GB" }]) {
    const encoder = new OrchestrationEncoder();
    encoder.begin(resources);
    expect(() => encoder.bind({ ...input(resources[1]!), components: [changed] }, {})).toThrow(/No expected resource/);
  }
});

test("wrong quantity, region and billing are rejected by the orchestration oracle", () => {
  for (const change of [{ quantity: 2 }, { region: "la-south-2" }, { billing: "monthly" }]) {
    const encoder = new OrchestrationEncoder();
    encoder.begin(resources);
    expect(() => encoder.bind({ ...input(resources[0]!), ...change }, {})).toThrow(/No expected resource/);
  }
});

test("missing resources, unbound forms and duplicate encoding cannot silently pass", () => {
  const encoder = new OrchestrationEncoder();
  encoder.begin(resources);
  expect(() => encoder.assertComplete()).toThrow(/Unconsumed resources/);
  expect(() => encoder.encode("obs", {})).toThrow(/Unbound form/);
  const form = {};
  encoder.bind(input(resources[0]!), form);
  encoder.encode("obs", form);
  expect(() => encoder.encode("obs", form)).toThrow(/Unbound form/);
});

test("identical resources retain multiplicity and all bound forms must be encoded", () => {
  const encoder = new OrchestrationEncoder();
  encoder.begin([resources[0]!, { ...resources[0]!, id: "hot-copy" }]);
  const first = {}, second = {};
  encoder.bind(input(resources[0]!), first);
  encoder.bind(input(resources[0]!), second);
  expect(() => encoder.assertComplete()).toThrow(/Unencoded resources/);
  const cards = [encoder.encode("obs", second), encoder.encode("obs", first)];
  expect(cards.map(c => c.selectedProduct._customTitle).sort()).toEqual(["hot", "hot-copy"]);
  encoder.assertComplete();
});

test("encoded cards must reach publication exactly once with their original identities", () => {
  const encoder = new OrchestrationEncoder();
  encoder.begin(resources);
  const cards = resources.map(resource => {
    const form = { template_RENDER: { storage_class: resource.options.storage_class } };
    encoder.bind(input(resource), form);
    return encoder.encode(resource.service, form);
  });
  expect(() => encoder.assertPublished([...cards].reverse())).not.toThrow();
  expect(() => encoder.assertPublished(cards.slice(1))).toThrow(/Published resources/);
  expect(() => encoder.assertPublished([cards[0]!, cards[0]!])).toThrow(/Published resources/);
  const crossWired = structuredClone(cards);
  [crossWired[0]!.rewriteValue, crossWired[1]!.rewriteValue] = [crossWired[1]!.rewriteValue, crossWired[0]!.rewriteValue];
  expect(() => encoder.assertPublished(crossWired)).toThrow(/Published resources/);
  for (const change of [{ region: "la-south-2" }, { chargeModeName: "MONTHLY" }, { _customTitle: "unknown" }]) {
    const changed = structuredClone(cards);
    Object.assign(changed[0]!.selectedProduct, change);
    expect(() => encoder.assertPublished(changed)).toThrow(/Published resources/);
  }
});
