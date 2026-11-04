import { z } from "zod";
import { endpoints } from "./endpoints.ts";
import { CalculatorError, mapUpstreamError } from "./errors.ts";
import { ListReference } from "./schemas.ts";

const product = z.looseObject({ resourceSpecCode: z.unknown().optional(), productNum: z.unknown().optional(), resourceSize: z.unknown().optional(), inquiryResult: z.looseObject({ amount: z.unknown().optional() }).optional() });
const selected = z.looseObject({ serviceCode: z.unknown().optional(), region: z.unknown().optional(), chargeModeName: z.unknown().optional(), _customTitle: z.unknown().optional(), amount: z.unknown().optional(), productAllInfos: z.array(product).optional() });
const detail = z.looseObject({ name: z.unknown().optional(), totalPrice: z.unknown().optional(), cartListData: z.array(z.looseObject({ selectedProduct: selected })) });
const response = z.looseObject({ retCode: z.union([z.string(), z.number()]), data: z.unknown().optional() });
interface UncachedReader { getUncached(url: string): Promise<unknown> }
export async function shareDetail(reader: UncachedReader, reference: string): Promise<z.output<typeof detail>> {
  const id = ListReference.parse(reference);
  const parsed = response.safeParse(await reader.getUncached(endpoints.detail(id)));
  if (!parsed.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid shared-list response");
  const code = String(parsed.data.retCode);
  if (!["200", "CBC.0000"].includes(code)) throw mapUpstreamError(code);
  const result = detail.safeParse(parsed.data.data);
  if (!result.success) throw new CalculatorError("UNEXPECTED_RESPONSE", "Invalid shared-list detail");
  return result.data;
}
export async function readPriceList(reader: UncachedReader, reference: string) {
  const id = ListReference.parse(reference);
  const data = await shareDetail(reader, id);
  const items = data.cartListData.map(({ selectedProduct: sp }) => ({ service: sp.serviceCode ?? null, region: sp.region ?? null, mode: sp.chargeModeName ?? null, title: sp._customTitle ?? null, amount: sp.amount ?? null,
    products: (sp.productAllInfos ?? []).map(p => ({ spec: p.resourceSpecCode ?? null, num: p.productNum ?? null, size: p.resourceSize ?? null, amount: p.inquiryResult?.amount ?? null, ...(p.usageFactor === undefined ? {} : { usageFactor: p.usageFactor, usageValue: p.usageValue ?? null, usageMeasureId: p.usageMeasureId ?? null }) })) }));
  const total = data.totalPrice !== null && typeof data.totalPrice === "object" && !Array.isArray(data.totalPrice) ? (data.totalPrice as Record<string, unknown>).amount : data.totalPrice;
  return { id, name: data.name ?? null, items, total: total ?? null };
}

type AuthRequest = (method: "GET" | "POST", url: string, body?: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;
export class ListSession {
  constructor(private readonly request: AuthRequest, private readonly refresh: () => Promise<void>) {}
  private async call(method: "GET" | "POST", url: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: { status: number; body: unknown };
      try { response = await this.request(method, url, body); }
      catch (error) {
        if (error instanceof CalculatorError && ["AUTH_REQUIRED", "VALIDATION", "CANCELLED"].includes(error.code)) throw error;
        if (method === "POST") throw new CalculatorError("MUTATION_UNKNOWN", "Saved-list operation outcome is unknown", "Check your saved lists before trying again.");
        throw new CalculatorError("UPSTREAM", "List request failed");
      }
      if (response.status === 413) throw new CalculatorError("PAYLOAD_TOO_LARGE", "Price list payload is too large", "Split the list into smaller lists.", { cardCount: Array.isArray(body?.cartListData) ? body.cartListData.length : undefined });
      if (response.body === null || typeof response.body !== "object" || Array.isArray(response.body)) throw new CalculatorError(method === "POST" ? "MUTATION_UNKNOWN" : "UNEXPECTED_RESPONSE", method === "POST" ? "Saved-list operation outcome is unknown" : "Invalid saved-list response", method === "POST" ? "Check your saved lists before trying again." : undefined);
      const data = response.body as Record<string, unknown>, code = String(data.retCode ?? "200");
      if (code === "CBC.0101" && attempt === 0) { await this.refresh(); continue; }
      if (code === "CBC.0101") throw new CalculatorError("AUTH_EXPIRED", "Calculator session has expired", "Run login to sign in again.");
      if (!["200", "CBC.0000"].includes(code)) throw mapUpstreamError(code);
      if (response.status !== 200) throw new CalculatorError("UPSTREAM", `Saved-list request failed (HTTP ${response.status})`);
      return data;
    }
    throw new CalculatorError("AUTH_EXPIRED", "Calculator session has expired");
  }
  async lists(): Promise<unknown[]> { const result = await this.call("GET", endpoints.list); if (!Array.isArray(result.lists)) throw new CalculatorError("UNEXPECTED_RESPONSE", "List response has no lists array"); return result.lists; }
  async create(payload: Record<string, unknown>): Promise<string> { const result = await this.call("POST", endpoints.add, payload); const parsed = ListReference.safeParse(result.data); if (!parsed.success) throw new CalculatorError("MUTATION_UNKNOWN", "Create response has no valid list ID", "Check your saved lists before trying again."); return parsed.data; }
  async update(id: string, payload: Record<string, unknown>): Promise<void> { await this.call("POST", endpoints.update(ListReference.parse(id)), payload); }
  async delete(id: string): Promise<void> { await this.call("POST", endpoints.delete(ListReference.parse(id))); }
  async copy(id: string): Promise<string> { const result = await this.call("POST", endpoints.copy(ListReference.parse(id))); const parsed = ListReference.safeParse(result.data); if (!parsed.success) throw new CalculatorError("MUTATION_UNKNOWN", "Copy response has no valid list ID", "Check your saved lists before trying again."); return parsed.data; }
}
