import { isDeepStrictEqual } from "node:util";

export interface ExpectedResource {
  id: string;
  service: string;
  region: string;
  billing: string;
  quantity: number;
  spec: string;
  options: Record<string, unknown>;
  specInput?: Record<string, unknown>;
}

/** A test-side transport double, not a vendor encoder or a price/publication oracle.
 * Checks that orchestration forwards each expected input exactly once. Real builders
 * still build the forms; independently specified semantic tests check their contents.
 */
export class OrchestrationEncoder {
  private pending: ExpectedResource[] = [];
  private resources: ExpectedResource[] = [];
  private bindings = new WeakMap<object, ExpectedResource>();
  private forms = new Map<string, object>();
  private expectedCount = 0;
  private encodedCount = 0;
  private active = false;

  begin(resources: ExpectedResource[]): void {
    if (this.active) throw new Error("Previous orchestration expectations were not checked");
    this.pending = structuredClone(resources);
    this.resources = structuredClone(resources);
    this.expectedCount = resources.length;
    this.encodedCount = 0;
    this.bindings = new WeakMap();
    this.forms = new Map();
    this.active = true;
  }

  bind(input: Record<string, unknown>, form: object): void {
    if (!this.active) return; // Standalone form previews are outside an apply run.
    if (this.bindings.has(form)) throw new Error("The same form object was reused for multiple resources");
    const index = this.pending.findIndex(expected =>
      expected.service.toLowerCase() === String(input.service).toLowerCase() &&
      expected.region === input.region &&
      expected.billing === input.billing &&
      expected.quantity === (input.quantity ?? 1) &&
      Object.entries({ ...expected.options, ...expected.specInput }).every(([key, value]) =>
        key in input && isDeepStrictEqual(input[key], value)));
    if (index === -1) throw new Error(`No expected resource matches ${String(input.service)}/${String(input.region)}/${String(input.billing)}`);
    const expected = this.pending.splice(index, 1)[0]!;
    this.bindings.set(form, expected);
    this.forms.set(expected.id, structuredClone(form));
  }

  encode(service: string, form: Record<string, unknown>) {
    const expected = this.bindings.get(form);
    if (!expected) throw new Error("Unbound form was passed to the orchestration encoder");
    if (service.toLowerCase() !== expected.service.toLowerCase()) throw new Error("Encoded service differs from the expected resource");
    this.bindings.delete(form);
    this.encodedCount++;
    return {
      rewriteValue: form,
      selectedProduct: {
        serviceCode: service,
        region: expected.region,
        chargeModeName: expected.billing.toUpperCase(),
        _customTitle: expected.id,
        // Primary identity only: this double deliberately does not simulate vendor
        // companion products, prices, Edit, or the authenticated publish gate.
        productAllInfos: [{ resourceSpecCode: expected.spec, productNum: expected.quantity }],
      },
    };
  }

  assertComplete(): void {
    if (this.pending.length) throw new Error(`Unconsumed resources: ${this.pending.map(r => r.id).join(", ")}`);
    if (this.encodedCount !== this.expectedCount) throw new Error(`Unencoded resources: expected ${this.expectedCount}, got ${this.encodedCount}`);
    this.active = false;
  }

  assertPublished(cards: Record<string, any>[]): void {
    const expected = this.resources.map(resource => [resource.id, resource.service.toLowerCase(), resource.region,
      resource.billing.toUpperCase(), resource.spec, resource.quantity]);
    const actual = cards.map(card => {
      const product = card.selectedProduct ?? {};
      const primary = product.productAllInfos?.[0] ?? {};
      return [product._customTitle, String(product.serviceCode).toLowerCase(), product.region,
        product.chargeModeName, primary.resourceSpecCode, primary.productNum];
    });
    const sorted = (rows: unknown[][]) => rows.map(row => JSON.stringify(row)).sort();
    if (!isDeepStrictEqual(sorted(actual), sorted(expected))) {
      throw new Error("Published resources differ from the complete expected resource multiset");
    }
    for (const card of cards) {
      const id = card.selectedProduct._customTitle;
      if (!this.forms.has(id) || !isDeepStrictEqual(card.rewriteValue, this.forms.get(id))) {
        throw new Error(`Published resources contain a changed or cross-wired form for ${String(id)}`);
      }
    }
  }
}
