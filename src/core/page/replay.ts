/** Any service on the calculator page: a card's form state -> steps -> the page's own card.
 *
 * The state says *what* to fill (a card's `rewriteValue`); the page builds the card. The two are
 * compared afterwards, so a form state the page cannot reproduce fails instead of shipping the
 * original card. Port of autocalc/page/replay.py.
 */
export type Kind = "radio" | "select" | "region" | "stepper" | "add" | "checkbox" | "auto";
/** Set one form control. `componentId` is the control's config id (viewConfig.id); for `add` it is the addible's id. */
export interface Step { componentId: string; kind: Kind; value?: unknown }

type Dict = Record<string, unknown>;
const ADDIBLE = "_|addible0|_";
const ROW = /^.*_\|addible0\|_\d+$/;
export const GLOBAL_STEPPER: Record<string, string> = { global_ONDEMANDTIME: "global_ONDEMANDTIME_Stepper_0", global_QUANTITY: "global_QUANTITY_Stepper_0" };
const isDict = (value: unknown): value is Dict => typeof value === "object" && value !== null && !Array.isArray(value);
const step = (componentId: string, kind: Kind, value?: unknown): Step => ({ componentId, kind, value });

const measure = (value: unknown): unknown => isDict(value) && "measureValue" in value ? value.measureValue : value;

/** Flatten one form-state entry. A nested key that starts with its parent's id is a full id. */
function leaves(prefix: string, value: unknown, steps: Step[], added: Set<string>): void {
  if (isDict(value) && !("measureValue" in value)) {
    for (const [key, sub] of Object.entries(value)) {
      const child = key.startsWith(prefix) ? key : `${prefix}_${key}`;
      if (ROW.test(child) && !added.has(child)) { added.add(child); steps.push(step(child.split(ADDIBLE)[0]!, "add")); } // one add click per addible row
      leaves(child, sub, steps, added);
    }
    return;
  }
  steps.push(step(prefix.replace("_UNSET_Stepper", "_Stepper"), "auto", measure(value)));
}

const numeric = (value: unknown): number | undefined => {
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
};
const text = (value: unknown) => value === true ? "True" : value === false ? "False" : String(value);

/** Equal as the form means it: a text input keeps '6' where the builder wrote 6.0, and a checkbox
 * group holds the same boxes in whatever order the page ticked them. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) { const x = a.map(text).sort(), y = b.map(text).sort(); return x.length === y.length && x.every((v, i) => v === y[i]); }
  const x = numeric(a), y = numeric(b);
  if (x !== undefined && y !== undefined) return x === y;
  return a === b || (a === undefined && b === null) || (a === null && b === undefined);
}

/** The form state as {control id: value}, flattened the way cardSteps addresses controls. */
export function formValues(templateRender: Dict): Dict {
  const steps: Step[] = [];
  for (const [group, value] of Object.entries(templateRender)) leaves(group, value, steps, new Set());
  return Object.fromEntries(steps.filter(s => s.kind === "auto").map(s => [s.componentId, s.value]));
}

/** The values of the global steppers the page keeps outside template_RENDER. */
export function globalValues(formState: Dict): Dict {
  return Object.fromEntries(Object.entries(GLOBAL_STEPPER).map(([group, id]) => [id, measure((isDict(formState[group]) ? formState[group] as Dict : {}).UNSET_Stepper_0)]));
}

/** The steps that fill the form with a rewriteValue's state, globals first. */
export function cardSteps(rewriteValue: Dict): Step[] {
  const region = (rewriteValue.global_REGIONINFO ?? {}) as Dict, steps: Step[] = [];
  if (region.region) steps.push(step("global_REGIONINFO_region", "region", region.region)); // global pages have none
  if (region.chargeMode) steps.push(step("global_REGIONINFO_chargeMode", "radio", region.chargeMode));
  const period = (rewriteValue.global_PERIODTIME as Dict | undefined)?.UNSET_PeriodTime as Dict | undefined;
  if (period) steps.push(step("global_PERIODTIME_UNSET_PeriodTime", "radio", `${period.measureValue}_${period.measureId}`));
  const hours = rewriteValue.global_ONDEMANDTIME as Dict | undefined;
  if (hours) steps.push(step(GLOBAL_STEPPER.global_ONDEMANDTIME!, "auto", measure(hours.UNSET_Stepper_0)));
  const added = new Set<string>();
  for (const [group, value] of Object.entries((rewriteValue.template_RENDER ?? {}) as Dict)) leaves(group, value, steps, added);
  const quantity = rewriteValue.global_QUANTITY as Dict | undefined;
  if (quantity) steps.push(step(GLOBAL_STEPPER.global_QUANTITY!, "auto", measure(quantity.UNSET_Stepper_0)));
  return steps;
}

// Where the page's on-demand form uses other control ids than the saved cards of the same service
// (observed on SFS Turbo: the "Demand" controls replace the "Period" ones in on-demand billing).
const ALIASES: Record<string, Record<string, string>> = {
  "sfsturbo|ONDEMAND": { calculator_sfsType_radio: "calculator_sfsDemand_radio", calculator_sfsPeriod_36input: "calculator_sfsDemand_36input", calculator_sfsPeriod_12input: "calculator_sfsDemand_12input" },
  "vpn|ONDEMAND": {
    calculator_evpnEip1_stepper_Stepper_0: "calculator_eip_charge_mode_radio_Stepper_0",
    calculator_evpnEip2_stepper_Stepper_0: "calculator_evpnEip2_ondemand_stepper_Stepper_0",
    calculator_evpnGatewaySpec_radio_Stepper_1: "calculator_evpnGatewaySpec_radio_Stepper_3",
  },
};
// builder key -> the calculator's own service key, where they differ in case
export const PAGE_SERVICE: Record<string, string> = { rabbitmq: "rabbitMQ" };

/** The form state with the control ids this billing mode's form uses. */
export function forPage(service: string, rewriteValue: Dict): Dict {
  const mode = String(((rewriteValue.global_REGIONINFO ?? {}) as Dict).chargeMode ?? ""), rename = ALIASES[`${service}|${mode}`] ?? {};
  const render = Object.fromEntries(Object.entries((rewriteValue.template_RENDER ?? {}) as Dict).map(([group, value]) => [rename[group] ?? group, value]));
  return { ...rewriteValue, template_RENDER: render };
}

/** The first of region / chargeMode where the card's priced product differs from the request (no region asked: none). */
export function pricedElsewhere(rewriteValue: Dict, card: Dict): string | undefined {
  const asked = (rewriteValue.global_REGIONINFO ?? {}) as Dict, product = (card.selectedProduct ?? {}) as Dict;
  return ["region", "chargeMode"].find(field => asked[field] && product[field] !== asked[field]);
}
