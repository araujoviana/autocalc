/** Canonical Resource Intermediate Representation (IR).
 * Represents the resolved financial and physical card architecture contract
 * independent of unstable vendor UI control bindings. */
import type { NormalizedResource } from "./horizon.ts";
import type { QuoteDocument } from "./ast.ts";

export interface PhysicalCardMapping {
  cardIndex: number;
  cardId: string;
  title: string;
  options: Record<string, unknown>;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
}

export interface CanonicalResourceIR {
  id: string;
  environment?: string | undefined;
  service: string;
  region: string;
  availability: "single-az" | "multi-az";
  billing: string;
  quantity: number;
  spec?: string | undefined;
  needs?: Record<string, unknown> | undefined;
  options?: Record<string, unknown> | undefined;
  skuCode?: string | undefined;
  unitPrice?: number | undefined;
  totalPrice?: number | undefined;
  physicalCards: PhysicalCardMapping[];
}

export interface CanonicalQuoteIR {
  version: "1";
  metadata: {
    id: string;
    customer: string;
    titlePrefix?: string | undefined;
    currency: string;
  };
  horizon: {
    duration: "1m" | "1y";
    effectiveMonths: number;
  };
  resources: CanonicalResourceIR[];
  totalAmount: number;
  inputHash: string;
}

/** Computes a deterministic SHA-256 hash of the normalized resources input. */
export function computeInputHash(doc: QuoteDocument, resources: NormalizedResource[]): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(JSON.stringify({ doc, resources }, Object.keys(doc).sort()));
  return hasher.digest("hex");
}

/** Builds the canonical IR representation from normalized resources. */
export function buildCanonicalQuoteIR(doc: QuoteDocument, resources: NormalizedResource[]): CanonicalQuoteIR {
  const inputHash = computeInputHash(doc, resources);
  const duration = doc.horizon?.duration ?? "1m";
  const effectiveMonths = duration === "1y" ? 12 : 1;

  let grandTotal = 0;
  const canonicalResources: CanonicalResourceIR[] = resources.map((res, index) => {
    // By default 1:1 logical to physical card mapping
    const title = res.id;
    const unitPrice = 0;
    const totalPrice = 0;
    grandTotal += totalPrice;

    const physicalCards: PhysicalCardMapping[] = [
      {
        cardIndex: index,
        cardId: `${res.id}-0`,
        title,
        options: { ...(res.options ?? {}) },
        quantity: res.quantity,
        unitAmount: unitPrice,
        totalAmount: totalPrice,
      },
    ];

    return {
      id: res.id,
      environment: res.environment,
      service: res.service,
      region: res.region,
      availability: res.availability,
      billing: res.billing,
      quantity: res.quantity,
      spec: res.spec,
      needs: res.needs ? { ...res.needs } : undefined,
      options: res.options ? { ...res.options } : undefined,
      skuCode: undefined,
      unitPrice,
      totalPrice,
      physicalCards,
    };
  });

  return {
    version: "1",
    metadata: {
      id: doc.metadata.id,
      customer: doc.metadata.customer,
      titlePrefix: doc.metadata.title_prefix,
      currency: doc.metadata.currency ?? "USD",
    },
    horizon: {
      duration,
      effectiveMonths,
    },
    resources: canonicalResources,
    totalAmount: grandTotal,
    inputHash,
  };
}
