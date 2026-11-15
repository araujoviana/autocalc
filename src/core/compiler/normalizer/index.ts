/** Translates compiled `version: "1"` NormalizedResources into canonical Quote card records
 * compatible with `validate()`, `plan()`, and `publishQuoteTool()`. */
import { modesOf, SINGLE_QUANTITY } from "../../services/publication.ts";
import type { NormalizedResource } from "../horizon.ts";
import { parseRequestRate } from "../units.ts";
import { normalizeServiceAlias, SERVICE_ALIASES } from "./aliases.ts";
import { normalizeComputeStorageService } from "./compute-storage.ts";
import { normalizeDatabaseMiddlewareService } from "./database-middleware.ts";
import { normalizeNetworkSecurityPaasService } from "./network-security-paas.ts";
import {
  type CardNormalizeState,
  type Dict,
  obsFactorMaxPerCard,
  splitIntoChunks,
  toGB,
  toRequestsPerMonth,
  toTrafficGB,
} from "./shared.ts";

export { normalizeServiceAlias, SERVICE_ALIASES };

/** Expands a single NormalizedResource into 1 or more physical quote cards when
 * variable metrics (DEW keys/API calls, OBS capacity/requests/traffic) exceed per-card UI stepper limits.
 * Tiered OBS traffic lines are greedy max-packed (never evenly split across cards) to preserve tier brackets. */
export function normalizeResourceToCards(r: NormalizedResource, docBillingPolicy?: string): Dict[] {
  const baseCard = normalizeResourceToCard(r, docBillingPolicy);
  const service = String(baseCard.service);
  const rawOpts: Dict = { ...(r.options ?? {}) };
  const rawNeeds: Dict = { ...(r.needs ?? {}) };

  if (service === "dew") {
    const rawQty = r.quantity ?? 1;
    const totalKeys = Math.max(1, Math.round(Number(rawOpts.keys ?? rawOpts.custom_keys ?? (rawQty > 1 ? rawQty : 1))));
    const rawApi = rawOpts.api_requests ?? rawOpts.kms_api_requests ?? rawOpts.requests;
    let totalApiUnits = 10;
    if (typeof rawApi === "number" && Number.isFinite(rawApi)) {
      totalApiUnits = Math.max(1, Math.round(rawApi));
    } else if (typeof rawApi === "string" && rawApi.trim()) {
      const parsed = parseRequestRate(rawApi, `${r.id}.api_requests`);
      totalApiUnits = parsed.perMonth >= 10000 ? Math.max(1, Math.round(parsed.perMonth / 10000)) : Math.max(1, Math.round(parsed.perMonth));
    }

    const keyChunks = splitIntoChunks(totalKeys, 99);
    const apiChunks = splitIntoChunks(totalApiUnits, 9999);
    const cardCount = Math.max(keyChunks.length, apiChunks.length, 1);
    if (cardCount === 1) return [baseCard];

    return Array.from({ length: cardCount }, (_, idx) => ({
      ...baseCard,
      id: `${r.id}-${idx + 1}`,
      options: {
        ...baseCard.options,
        keys: keyChunks[idx] ?? 0,
        api_requests: apiChunks[idx] ?? 0,
      },
    }));
  }

  if (service === "obs" && !rawOpts.package) {
    const storageClass: "standard" | "warm" | "cold" = baseCard.options.storage_class ?? "standard";
    const multiAz = Boolean(baseCard.options.multi_az);
    const sizeFactor = { standard: multiAz ? "size_3az" : "size", warm: multiAz ? "size_warm_3az" : "size_warm", cold: "size_cold" }[storageClass];

    const rawComps: Dict[] = [];
    if (Array.isArray(rawOpts.components)) {
      rawComps.push(...rawOpts.components);
    } else {
      const capGb = toGB(rawOpts.capacity ?? rawOpts.size ?? rawOpts.storage ?? rawOpts.size_gb ?? rawNeeds.capacity ?? rawNeeds.storage, `${r.id}.capacity`);
      if (capGb !== undefined && capGb > 0) {
        if (capGb > 102400) {
          rawComps.push({ factor: sizeFactor, value: Math.max(1, Math.round(capGb / 1024)), unit: "TB" });
        } else {
          rawComps.push({ factor: sizeFactor, value: Math.max(1, Math.round(capGb)), unit: "GB" });
        }
      } else {
        rawComps.push({ factor: sizeFactor, value: 100, unit: "GB" });
      }

      const trafficGb = toTrafficGB(rawOpts.traffic ?? rawOpts.outbound ?? rawOpts.egress ?? rawOpts.read_traffic ?? rawOpts.egress_traffic ?? rawOpts.traffic_gb, `${r.id}.traffic`);
      if (trafficGb !== undefined && trafficGb > 0) {
        const dlFactor = { standard: "download.external", warm: "download_warm.external", cold: "download_cold.external" }[storageClass];
        rawComps.push({ factor: dlFactor, value: Math.max(1, Math.round(trafficGb)) });
      }

      const cdnGb = toTrafficGB(rawOpts.cdn_traffic ?? rawOpts.download_cdn, `${r.id}.cdn_traffic`);
      if (cdnGb !== undefined && cdnGb > 0) {
        rawComps.push({ factor: "download.cdn", value: Math.max(1, Math.round(cdnGb)) });
      }

      const getReqs = toRequestsPerMonth(rawOpts.requests_get ?? rawOpts.get_requests ?? rawOpts.read_requests ?? rawOpts.get);
      if (getReqs !== undefined && getReqs > 0) {
        const getFactor = { standard: "get", warm: "get_warm", cold: "get_cold" }[storageClass];
        const unitDiv = storageClass === "standard" ? 10000 : 1000;
        const units = getReqs >= unitDiv ? Math.round(getReqs / unitDiv) : Math.round(getReqs);
        rawComps.push({ factor: getFactor, value: Math.max(1, units) });
      }

      const putReqs = toRequestsPerMonth(rawOpts.requests_put ?? rawOpts.put_requests ?? rawOpts.write_requests ?? rawOpts.put);
      if (putReqs !== undefined && putReqs > 0) {
        const putFactor = { standard: "put", warm: "put_warm", cold: "put_cold" }[storageClass];
        const unitDiv = storageClass === "standard" ? 10000 : 1000;
        const units = putReqs >= unitDiv ? Math.round(putReqs / unitDiv) : Math.round(putReqs);
        rawComps.push({ factor: putFactor, value: Math.max(1, units) });
      }
    }

    const chunkedByComp = rawComps.map(comp => {
      const maxVal = obsFactorMaxPerCard(String(comp.factor));
      const chunks = splitIntoChunks(Number(comp.value ?? 0), maxVal);
      return (chunks.length ? chunks : [0]).map(val => ({
        factor: comp.factor,
        value: val,
        ...(comp.unit ? { unit: comp.unit } : {}),
      }));
    });

    const cardCount = Math.max(1, ...chunkedByComp.map(c => c.length));
    if (cardCount === 1) return [baseCard];

    return Array.from({ length: cardCount }, (_, idx) => {
      const compsForCard = chunkedByComp
        .map(chunks => chunks[idx])
        .filter((c): c is NonNullable<typeof c> => c !== undefined && c.value > 0);
      return {
        ...baseCard,
        id: `${r.id}-${idx + 1}`,
        options: {
          ...baseCard.options,
          components: compsForCard,
        },
      };
    });
  }

  const rawQty = r.quantity ?? 1;
  if (rawQty > 1 && (SINGLE_QUANTITY.has(service) || (service === "cce" && baseCard.billing === "ondemand"))) {
    return Array.from({ length: rawQty }, (_, idx) => ({
      ...baseCard,
      id: `${r.id}-${idx + 1}`,
      quantity: 1,
    }));
  }

  return [baseCard];
}

/** Normalizes a single `version: "1"` NormalizedResource into a canonical Quote card object. */
export function normalizeResourceToCard(r: NormalizedResource, docBillingPolicy?: string): Dict {
  const service = normalizeServiceAlias(r.service);
  const rawNeeds: Dict = { ...(r.needs ?? {}) };
  const rawOpts: Dict = { ...(r.options ?? {}) };

  let billing = r.billing.toLowerCase();
  if (billing === "pay-per-use") billing = "ondemand";
  if (docBillingPolicy === "recommend-annual" && r.horizon.duration === "1y" && billing === "monthly") {
    const modes = modesOf(service);
    if (modes.includes("yearly") && !(service === "obs" && !rawOpts.package)) {
      billing = "yearly";
    }
  }
  if (service === "obs" && !rawOpts.package) {
    billing = "ondemand";
  } else {
    const modes = modesOf(service);
    if (modes.length > 0 && !modes.includes(billing)) {
      billing = modes[0]!;
    }
  }

  const rawVcpus = rawNeeds.vcpus ?? rawNeeds.vcpu ?? rawNeeds.cores ?? rawNeeds.cpu;
  const vcpus = typeof rawVcpus === "number" && Number.isFinite(rawVcpus) ? rawVcpus : undefined;
  const memory_gb = toGB(rawNeeds.memory_gb ?? rawNeeds.memory ?? rawNeeds.ram, `${r.id}.memory`);

  const engine = String(rawNeeds.engine ?? rawOpts.engine ?? "").toLowerCase();
  const topology = String(rawNeeds.topology ?? rawOpts.topology ?? "").toLowerCase();
  const haHint = r.availability === "multi-az" || topology.includes("ha") || topology.includes("standby") || topology.includes("cluster") || topology.includes("multi");

  const quantity = r.quantity ?? 1;
  const spec: string | undefined = r.spec;
  let needs: Dict | undefined;

  if (vcpus !== undefined || memory_gb !== undefined) {
    needs = {
      ...(vcpus !== undefined ? { vcpus } : {}),
      ...(memory_gb !== undefined ? { memory_gb } : {}),
    };
  }

  const state: CardNormalizeState = {
    r,
    service,
    rawNeeds,
    rawOpts,
    vcpus,
    memory_gb,
    engine,
    topology,
    haHint,
    billing,
    quantity,
    spec,
    needs,
    options: {},
  };

  const matched =
    normalizeComputeStorageService(state) ||
    normalizeDatabaseMiddlewareService(state) ||
    normalizeNetworkSecurityPaasService(state);
  if (!matched) {
    Object.assign(state.options, rawOpts);
  }

  // resource-level billing term: periods (monthly/yearly packages) and hours (pay-per-use) go to the builder
  const term = r;
  if (typeof term.periods === "number" && state.billing !== "ondemand" && state.billing !== "ri") state.options.periods = term.periods;
  if (typeof term.hours === "number" && state.billing === "ondemand") state.options.hours = term.hours;
  return {
    id: r.id,
    service,
    region: service === "maas" ? "ap-southeast-1" : r.region,
    billing: state.billing,
    quantity: state.quantity,
    ...(state.needs && Object.keys(state.needs).length > 0 ? { needs: state.needs } : {}),
    ...(state.spec ? { spec: state.spec } : {}),
    options: state.options,
  };
}
