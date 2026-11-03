import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardSteps, formValues, globalValues } from "../../src/core/page/replay.ts";
import { buildLtsForm, buildRecipe, RECIPES } from "../../src/core/services/forms.ts";

const CASES = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../tests/fixtures/public/form-requests.json"), "utf8"),
) as Array<{ service: string; billing: string; quantity: number; options: Record<string, unknown>; controls: Record<string, unknown> }>;

test("options become the form state in recipe order", () => {
  const rv = buildRecipe("redis", { region: "sa-brazil-1", billing: "monthly", instances: 2, version: "calc_3_" }).rewriteValue;
  expect(Object.keys(rv.template_RENDER)).toEqual(["calculator_redis_version_version", "calculator_redis_quantity_Stepper_0"]);
  expect(rv.global_PERIODTIME.UNSET_PeriodTime).toEqual({ measureValue: 1, measureId: 20 });
  expect(cardSteps(rv).map(s => s.componentId).at(-1)).toBe("calculator_redis_quantity_Stepper_0");
});

test("ondemand hours and quantity follow the recipe", () => {
  const rv = buildRecipe("memcached", { region: "sa-brazil-1", billing: "ondemand", hours: 100, quantity: 3 }).rewriteValue;
  expect(rv.global_ONDEMANDTIME.UNSET_Stepper_0.measureValue).toBe(100);
  expect(rv.global_QUANTITY.UNSET_Stepper_0.measureValue).toBe(3);
  expect("global_PERIODTIME" in rv).toBe(false);
});

test("unknown option is refused before the page opens", () => {
  expect(() => buildRecipe("dds", { region: "sa-brazil-1", flavour: "x" })).toThrow("no option 'flavour'");
});

test("every recipe names a control per option", () => {
  expect(Object.values(RECIPES).every(r => Object.values(r.controls).every(c => c.startsWith("calculator_")))).toBe(true);
});

test("regionless recipe has no region step", () => {
  const ucs = buildRecipe("ucs", { region: "sa-brazil-1" }).rewriteValue;
  expect("region" in ucs.global_REGIONINFO).toBe(false);
  expect(cardSteps(ucs).every(s => s.componentId !== "global_REGIONINFO_region")).toBe(true);
  const dds = buildRecipe("dds", { region: "sa-brazil-1" }).rewriteValue;
  expect(cardSteps(dds)[0]!.componentId).toBe("global_REGIONINFO_region");
});

test.each(CASES)("public request controls are preserved ($service)", item => {
  const input = { region: "sa-brazil-1", billing: item.billing, quantity: item.quantity, ...item.options };
  const form = item.service === "lts" ? buildLtsForm(input) : buildRecipe(item.service, input).rewriteValue;
  const values = formValues(form.template_RENDER);
  for (const [key, expected] of Object.entries(item.controls)) {
    expect(values[key]).toEqual(expected);
  }
  if (item.quantity !== 1) {
    expect(globalValues(form).global_QUANTITY_Stepper_0).toBe(item.quantity);
  }
});
