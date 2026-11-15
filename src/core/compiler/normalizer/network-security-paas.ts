/** Networking, security, observability, serverless, and AI token service card normalization rules. */
import { CalculatorError } from "../../errors.ts";
import { parseCapacity, parseDuration } from "../units.ts";
import {
  type CardNormalizeState,
  parseTokens,
  toGB,
  toMbps,
  toRequestsPerMonth,
  toTrafficGB,
} from "./shared.ts";

/** Normalizes networking, security, and PaaS/AI services into `state`; returns false if unhandled. */
export function normalizeNetworkSecurityPaasService(state: CardNormalizeState): boolean {
  const { r, service, rawNeeds, rawOpts, memory_gb, options } = state;

  switch (service) {
    case "elb": {
      state.quantity = 1;
      const isDedicated = rawOpts.type === "dedicated" || (typeof state.spec === "string" && state.spec.startsWith("elbv3.")) || (typeof rawOpts.flavor === "string" && rawOpts.flavor.startsWith("elbv3."));
      if (isDedicated) {
        options.type = "dedicated";
        const flavor = String(rawOpts.flavor ?? (state.spec?.startsWith("elbv3.") ? state.spec : "elbv3.professional"));
        options.flavor = flavor;
        state.spec = flavor;
        if (rawOpts.az_type !== undefined) options.az_type = rawOpts.az_type;
        if (rawOpts.protocol !== undefined) options.protocol = rawOpts.protocol;
        if (rawOpts.l4_lcu !== undefined || rawOpts.lcu !== undefined) {
          options.l4_lcu = Number(rawOpts.l4_lcu ?? rawOpts.lcu);
        }
        if (rawOpts.l7_lcu !== undefined) {
          options.l7_lcu = Number(rawOpts.l7_lcu);
        }
      } else {
        options.type = "shared";
        state.spec = state.spec ?? "elbv2.basic.default";
        if (rawOpts.public_ip_count !== undefined) {
          options.public_ip_count = Math.min(2, Math.max(1, Math.round(Number(rawOpts.public_ip_count))));
        } else if (rawOpts.network_type !== undefined || rawOpts.public !== undefined || rawOpts.internet_facing !== undefined) {
          const net = String(rawOpts.network_type ?? "").toLowerCase();
          const isPub = rawOpts.public === true || rawOpts.internet_facing === true || net.includes("public") || net.includes("internet") || net.includes("external");
          options.public_ip_count = isPub ? 1 : 2;
        }
      }
      state.needs = undefined;
      return true;
    }

    case "nat": {
      state.quantity = 1;
      const isPrivate = rawOpts.nat_type === "private" || String(rawOpts.type ?? "").toLowerCase() === "private" || String(state.spec ?? "").startsWith("privatenat_") || String(rawOpts.size ?? "").startsWith("privatenat_");
      let natSize = String(state.spec ?? rawOpts.size ?? rawOpts.tier ?? rawNeeds.size ?? "small").toLowerCase().replace(/^(natgateway_|privatenat_)/, "");
      if (["medium", "mid", "middle", "m"].includes(natSize)) natSize = isPrivate ? "medium" : "middle";
      else if (["large", "l"].includes(natSize)) natSize = "large";
      else if (["xlarge", "xl", "extra-large"].includes(natSize)) natSize = "xlarge";
      else natSize = "small";
      if (isPrivate) options.nat_type = "private";
      state.spec = isPrivate ? `privatenat_${natSize}` : `natgateway_${natSize}`;
      state.needs = undefined;
      return true;
    }

    case "apig": {
      state.quantity = 1;
      state.billing = "ondemand";
      const edRaw = String(state.spec ?? rawOpts.edition ?? rawNeeds.edition ?? "BASIC").toUpperCase();
      const ed = edRaw === "PRO" ? "PROFESSIONAL" : edRaw;
      state.spec = ["BASIC", "PROFESSIONAL", "ENTERPRISE", "PLATINUM"].includes(ed) ? ed : "BASIC";
      if (rawOpts.bandwidth_mbps !== undefined || rawOpts.bandwidth !== undefined) {
        const bw = toMbps(rawOpts.bandwidth_mbps ?? rawOpts.bandwidth, `${r.id}.bandwidth`);
        if (bw !== undefined) options.bandwidth_mbps = Math.min(2000, Math.max(0, Math.round(bw)));
      }
      state.needs = undefined;
      return true;
    }

    case "apm": {
      state.quantity = 1;
      state.billing = "ondemand";
      const validPkgDays = new Set(["150", "1200", "9600", "36500", "109500"]);
      const pkg = rawOpts.probe_days !== undefined ? String(Math.round(Number(rawOpts.probe_days))) : "";
      state.spec = String(state.spec ?? rawOpts.spec ?? (validPkgDays.has(pkg) ? `apm.pkg.enterprise.v2.${pkg}` : "apm2.instance.normal"));
      const probes = rawOpts.probes ?? rawOpts.agents ?? rawOpts.instances;
      if (probes !== undefined) options.probes = Math.max(1, Math.round(Number(probes)));
      state.needs = undefined;
      return true;
    }

    case "dline": {
      let portRaw = String(state.spec ?? rawOpts.port ?? rawOpts.speed ?? rawOpts.port_speed ?? rawOpts.bandwidth ?? rawNeeds.port ?? "1ge").toLowerCase().trim();
      const mbps = toMbps(rawOpts.bandwidth, `${r.id}.bandwidth`);
      if (mbps !== undefined) {
        portRaw = mbps >= 100000 ? "100ge" : mbps >= 40000 ? "40ge" : mbps >= 10000 ? "10ge" : "1ge";
      } else if (portRaw.includes("100")) {
        portRaw = "100ge";
      } else if (portRaw.includes("40")) {
        portRaw = "40ge";
      } else if (portRaw.includes("10")) {
        portRaw = "10ge";
      } else {
        portRaw = "1ge";
      }
      state.spec = portRaw;
      state.needs = undefined;
      return true;
    }

    case "waf": {
      state.quantity = 1;
      state.billing = "ondemand";
      state.spec = state.spec ?? "waf.payperuse.rule";
      const doms = rawOpts.domains ?? rawOpts.domain_count ?? rawOpts.domain_expansion;
      const rls = rawOpts.rules ?? rawOpts.rule_count ?? rawOpts.rule_expansion;
      if (doms !== undefined) options.domains = Math.max(1, Math.round(Number(doms)));
      if (rls !== undefined) options.rules = Math.max(1, Math.round(Number(rls)));
      const reqs = toRequestsPerMonth(rawOpts.requests ?? rawOpts.monthly_requests);
      if (reqs !== undefined) options.requests = Math.max(1000000, Math.round(reqs));
      state.needs = undefined;
      return true;
    }

    case "dew": {
      const mode = String(rawOpts.type ?? rawOpts.service_type ?? (state.spec?.startsWith("csms") ? "csms" : "kms")).toLowerCase();
      const isCsms = mode.includes("csms") || mode.includes("secret") || rawOpts.secrets !== undefined;
      const storageSpec = String(rawOpts.storage_spec ?? (isCsms ? "csms.secret.storage" : "kms.ud.customer"));
      const apiSpec = String(rawOpts.api_spec ?? (isCsms ? "csms.secret.api" : "kms.api"));
      const keys = Math.min(99, Math.max(1, Math.round(Number(rawOpts.secrets ?? rawOpts.keys ?? rawOpts.custom_keys ?? (state.quantity > 1 ? state.quantity : 1)))));
      let apiReqs = toRequestsPerMonth(rawOpts.requests ?? rawOpts.api_requests ?? rawOpts.kms_api_requests) ?? 10;
      if (apiReqs > 9999) apiReqs = Math.min(9999, Math.max(1, Math.round(apiReqs / 10000)));
      options.keys = keys;
      options.api_requests = Math.max(1, Math.round(apiReqs));
      options.storage_spec = storageSpec;
      options.api_spec = apiSpec;
      if (rawOpts.days !== undefined) options.days = Math.max(1, Math.round(Number(rawOpts.days)));
      state.spec = storageSpec;
      state.quantity = 1;
      state.billing = "ondemand";
      state.needs = undefined;
      return true;
    }

    case "ssa": {
      state.billing = "ondemand";
      state.quantity = 1;
      const edRaw = String(state.spec ?? rawOpts.edition ?? rawNeeds.edition ?? "professional").toLowerCase();
      state.spec = edRaw.includes("stand") ? "secmaster.standard" : edRaw.includes("basic") ? "secmaster.basic" : "secmaster.professional";
      state.needs = undefined;
      return true;
    }

    case "er": {
      state.billing = "ondemand";
      state.spec = state.spec ?? "er.vpc.attachment";
      options.attachments = Math.max(1, Math.round(Number(rawOpts.attachments ?? rawOpts.connections ?? (state.quantity > 1 ? state.quantity : 2))));
      const downflow = toTrafficGB(rawOpts.traffic ?? rawOpts.traffic_gb ?? rawOpts.data_transfer_gb ?? rawOpts.downflow_gb ?? rawOpts.downflow, `${r.id}.traffic`);
      options.downflow_gb = downflow !== undefined ? Math.max(1, Math.round(downflow)) : 100;
      const hrsRaw = rawOpts.hours ?? rawOpts.attachment_hours;
      if (hrsRaw !== undefined) {
        const hrs = typeof hrsRaw === "string" ? parseDuration(hrsRaw).inHours : Number(hrsRaw);
        options.attachment_hours = Math.max(1, Math.round(hrs));
      }
      state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "vpcep": {
      state.billing = "ondemand";
      state.quantity = 1;
      state.spec = state.spec ?? "vpcep.basic";
      const hrsRaw = rawOpts.hours ?? rawOpts.duration_hours;
      if (hrsRaw !== undefined) {
        const hrs = typeof hrsRaw === "string" ? parseDuration(hrsRaw).inHours : Number(hrsRaw);
        const epCount = Number(rawOpts.endpoints ?? rawOpts.quantity ?? 1);
        options.duration_hours = Math.max(1, Math.round(hrs * epCount));
      }
      state.needs = undefined;
      return true;
    }

    case "eip": {
      if (rawOpts.ip_reservation === false) {
        throw new CalculatorError("VALIDATION", "The calculator always includes the public IP line; ip_reservation cannot be false");
      }
      const isTraffic = rawOpts.billed_by === "traffic" || ((rawOpts.traffic_gb !== undefined || rawOpts.traffic !== undefined) && rawOpts.bandwidth_mbps === undefined && rawOpts.bandwidth === undefined);
      if (isTraffic) {
        options.share_type = "dedicated";
        options.billed_by = "traffic";
        state.billing = "ondemand";
        state.spec = "12_bgp";
        const trafficGb = toTrafficGB(rawOpts.traffic_gb ?? rawOpts.traffic, `${r.id}.traffic`);
        options.traffic_gb = trafficGb !== undefined ? Math.max(1, Math.round(trafficGb)) : 1;
      } else {
        options.billed_by = "bandwidth";
        const shareRaw = String(rawOpts.share_type ?? rawOpts.shareType ?? "").toLowerCase();
        const isShared = shareRaw === "shared" || shareRaw === "19_share" || shareRaw === "datainfo_4_" || state.spec === "19_share";
        options.share_type = isShared ? "shared" : "dedicated";
        state.spec = isShared ? "19_share" : "19_bgp";
        const bw = toMbps(rawOpts.bandwidth_mbps ?? rawOpts.bandwidth_mbit ?? rawOpts.bandwidth, `${r.id}.bandwidth`);
        options.bandwidth_mbps = bw !== undefined && bw > 0 ? Math.max(isShared ? 5 : 1, Math.round(bw)) : (isShared ? 5 : 1);
      }
      const ipQty = Number(rawOpts.count ?? rawOpts.ip_quantity ?? rawOpts.eip_count ?? 1);
      if (ipQty >= 1) options.ip_quantity = Math.min(99, Math.round(ipQty));
      state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "vpn": {
      state.quantity = 1;
      state.spec = state.spec ?? "19_bgp";
      if (rawOpts.mode !== undefined) {
        const m = String(rawOpts.mode).trim().toLowerCase();
        options.mode = ["p2c", "point-to-cloud", "point_to_cloud", "datainfo_21_"].includes(m)
          ? "dataInfo_21_"
          : ["s2s", "site-to-site", "site_to_site", "datainfo_1_"].includes(m)
            ? "dataInfo_1_"
            : String(rawOpts.mode);
      }
      if (rawOpts.network_type !== undefined) {
        const nt = String(rawOpts.network_type).trim().toLowerCase();
        options.network_type = ["private", "datainfo_15_"].includes(nt)
          ? "dataInfo_15_"
          : ["public", "datainfo_7_"].includes(nt)
            ? "dataInfo_7_"
            : String(rawOpts.network_type);
      }
      if (rawOpts.spec !== undefined) options.spec = String(rawOpts.spec);
      if (rawOpts.private_spec !== undefined) options.private_spec = String(rawOpts.private_spec);
      const bw = toMbps(rawOpts.bandwidth ?? rawOpts.bandwidth_mbps ?? rawOpts.shared_bandwidth_mbps, `${r.id}.bandwidth`);
      const eip1 = toMbps(rawOpts.eip1_mbps ?? rawOpts.eip1_bandwidth_mbps, `${r.id}.eip1_mbps`) ?? bw;
      const eip2 = toMbps(rawOpts.eip2_mbps ?? rawOpts.eip2_bandwidth_mbps, `${r.id}.eip2_mbps`) ?? bw;
      if (eip1 !== undefined) options.eip1_mbps = Math.min(300, Math.max(1, Math.round(eip1)));
      if (eip2 !== undefined) options.eip2_mbps = Math.min(300, Math.max(1, Math.round(eip2)));
      const conns = rawOpts.connections ?? rawOpts.tunnels ?? rawOpts.connection_groups;
      if (conns !== undefined) options.connection_groups = Math.max(1, Math.round(Number(conns)));
      if (rawOpts.p2c_eip_mbps !== undefined) options.p2c_eip_mbps = Math.min(300, Math.max(1, Math.round(Number(rawOpts.p2c_eip_mbps))));
      if (rawOpts.p2c_connections !== undefined) options.p2c_connections = Math.max(1, Math.round(Number(rawOpts.p2c_connections)));
      if (rawOpts.p2c_spec !== undefined) options.p2c_spec = String(rawOpts.p2c_spec);
      state.needs = undefined;
      return true;
    }

    case "cfw": {
      state.quantity = 1;
      const edRaw = String(state.spec ?? rawOpts.edition ?? "").toLowerCase();
      const isProf = state.billing === "ondemand" || edRaw.includes("prof");
      state.spec = isProf ? "cfw.professional" : "cfw.standard";
      options.edition = isProf ? "detail_11_" : "detail_3_";
      const bw = toMbps(rawOpts.protection_bandwidth_mbps ?? rawOpts.bandwidth_mbps ?? rawOpts.bandwidth_mbit ?? rawOpts.bandwidth ?? rawOpts.bandwidth_Add, `${r.id}.bandwidth`);
      if (bw !== undefined && bw > 0) options.bandwidth_mbps = Math.max(5, Math.round(bw / 5) * 5);
      const eips = rawOpts.protected_eips ?? rawOpts.eips ?? rawOpts.eip_Add;
      if (eips !== undefined) options.eips = Math.max(1, Math.round(Number(eips)));
      state.needs = undefined;
      return true;
    }

    case "hss": {
      const q = rawOpts.hosts ?? rawOpts.servers ?? rawOpts.quantity;
      if (q !== undefined && state.quantity === 1) {
        state.quantity = Math.max(1, Math.round(Number(q)));
      }
      const edRaw = String(state.spec ?? rawOpts.edition ?? rawNeeds.edition ?? "premium").toLowerCase();
      const map: Record<string, [string, string]> = {
        basic: ["hss.version.basic", "dataInfo_1_"],
        "hss.version.basic": ["hss.version.basic", "dataInfo_1_"],
        wtp: ["hss.version.wtp", "dataInfo_3_"],
        web_tamper_protection: ["hss.version.wtp", "dataInfo_3_"],
        "hss.version.wtp": ["hss.version.wtp", "dataInfo_3_"],
        premium: ["hss.version.premium", "dataInfo_4_"],
        "hss.version.premium": ["hss.version.premium", "dataInfo_4_"],
        container: ["hss.version.container.enterprise", "dataInfo_5_"],
        container_enterprise: ["hss.version.container.enterprise", "dataInfo_5_"],
        "hss.version.container.enterprise": ["hss.version.container.enterprise", "dataInfo_5_"],
        advanced: ["hss.version.advanced", "dataInfo_6_"],
        enterprise: ["hss.version.advanced", "dataInfo_6_"],
        "hss.version.advanced": ["hss.version.advanced", "dataInfo_6_"],
      };
      const [hssSpec, token] = map[edRaw] ?? ["hss.version.premium", "dataInfo_4_"];
      state.spec = state.billing === "ondemand" && (hssSpec === "hss.version.basic" || hssSpec === "hss.version.wtp") ? "hss.version.premium" : hssSpec;
      options.edition = state.spec === "hss.version.premium" ? "dataInfo_4_" : token;
      if (state.billing === "ondemand") state.quantity = 1;
      state.needs = undefined;
      return true;
    }

    case "function": {
      state.billing = "ondemand";
      state.quantity = 1;
      state.spec = state.spec ?? "functionstage";
      const reqRaw = rawOpts.requests ?? rawOpts.invocations ?? rawOpts.requests_10k ?? rawOpts.requests_ten_thousands ?? rawOpts.request_units;
      if (rawOpts.requests_10k !== undefined || rawOpts.requests_ten_thousands !== undefined) {
        options.requests_10k = Math.max(1, Math.round(Number(rawOpts.requests_10k ?? rawOpts.requests_ten_thousands)));
      } else if (reqRaw !== undefined) {
        const reqs = toRequestsPerMonth(reqRaw);
        if (reqs !== undefined) {
          options.requests_10k = Math.max(1, Math.round(reqs >= 10000 ? reqs / 10000 : reqs));
        } else {
          options.requests_10k = 200;
        }
      } else {
        options.requests_10k = 200;
      }
      if (rawOpts.memory_mb !== undefined) {
        const mb = typeof rawOpts.memory_mb === "number" ? rawOpts.memory_mb : Math.round(parseCapacity(rawOpts.memory_mb, `${r.id}.memory_mb`).inGB * 1024);
        options.memory_mb = Math.min(10240, Math.max(128, Math.round(mb)));
      } else if (rawOpts.memory !== undefined || memory_gb !== undefined) {
        const memGb = toGB(rawOpts.memory ?? memory_gb, `${r.id}.memory`) ?? 0.5;
        options.memory_mb = Math.min(10240, Math.max(128, Math.round(memGb * 1024)));
      } else {
        options.memory_mb = 512;
      }
      const computeVal = rawOpts.compute ?? rawOpts.compute_units ?? rawOpts.gb_seconds ?? rawOpts.execution_seconds;
      if (computeVal !== undefined) {
        options.compute = typeof computeVal === "number" ? computeVal : Number(computeVal) || 100;
      }
      state.needs = undefined;
      return true;
    }

    case "lts": {
      state.billing = "ondemand";
      state.quantity = 1;
      state.spec = state.spec ?? "lts.log.flow";
      const monthlyGb = toTrafficGB(rawOpts.monthly_flow ?? rawOpts.raw_log_size_gb ?? rawOpts.raw_log_size, `${r.id}.monthly_flow`);
      const flowDay = rawOpts.flow_gb_per_day !== undefined
        ? Number(rawOpts.flow_gb_per_day)
        : rawOpts.daily_flow !== undefined
          ? Number(rawOpts.daily_flow)
          : monthlyGb !== undefined
            ? Math.max(1, Math.round(monthlyGb / 30))
            : rawOpts.flow_gb !== undefined
              ? Math.max(1, Math.round(Number(rawOpts.flow_gb) / 30))
              : rawOpts.flow !== undefined || rawOpts.traffic !== undefined || rawOpts.capacity !== undefined
                ? Math.max(1, Math.round(((toTrafficGB(rawOpts.flow ?? rawOpts.traffic ?? rawOpts.capacity, `${r.id}.flow`)) ?? 30) / 30))
                : 5;
      options.flow_gb_per_day = Math.max(1, Math.round(flowDay));
      if (rawOpts.retention_days !== undefined || rawOpts.total_retention_days !== undefined) {
        options.retention_days = Math.min(365, Math.max(1, Math.round(Number(rawOpts.retention_days ?? rawOpts.total_retention_days))));
      }
      const idxPct = rawOpts.index_percent ?? rawOpts.index_ratio;
      if (idxPct !== undefined) {
        const num = typeof idxPct === "string" ? parseFloat(idxPct.replace("%", "")) : Number(idxPct);
        options.index_percent = Math.min(100, Math.max(1, Math.round(num)));
      }
      if (rawOpts.cold_enabled !== undefined || rawOpts.cold_storage !== undefined) {
        options.cold_enabled = Boolean(rawOpts.cold_enabled ?? rawOpts.cold_storage);
      }
      if (rawOpts.hot_retention_days !== undefined) options.hot_retention_days = Math.min(365, Math.max(1, Math.round(Number(rawOpts.hot_retention_days))));
      if (rawOpts.transfer_basic_gb_per_day !== undefined) options.transfer_basic_gb_per_day = Math.max(0, Number(rawOpts.transfer_basic_gb_per_day));
      if (rawOpts.transfer_senior_gb_per_day !== undefined) options.transfer_senior_gb_per_day = Math.max(0, Number(rawOpts.transfer_senior_gb_per_day));
      if (rawOpts.months !== undefined) options.months = Math.min(60, Math.max(1, Math.round(Number(rawOpts.months))));
      state.needs = undefined;
      return true;
    }

    case "maas": {
      state.billing = "ondemand";
      state.quantity = 1;
      const modelMap: Record<string, string> = {
        "deepseek-v4.1-flash": "modelarts.tokens.deepseek.v4.1.flash",
        "deepseek-v4-flash": "modelarts.tokens.deepseek.v4.flash",
        "glm-5.3": "modelarts.tokens.glm.5.3",
        "glm-5.2": "modelarts.tokens.glm.5.2",
        "glm-5.1": "modelarts.tokens.glm.5.1",
        "qwen3-32b": "modelarts.tokens.qwen3-32b",
      };
      const modelRaw = rawOpts.model ?? rawOpts.model_name;
      if (!state.spec) {
        const key = typeof modelRaw === "string" ? modelRaw.trim().toLowerCase() : "";
        state.spec = key.startsWith("modelarts.") ? modelRaw : (modelMap[key] ?? "modelarts.tokens.deepseek.v4.1.flash");
      }
      for (const field of ["model_series", "model_name", "model_service_type", "reasoning_mode", "billing_mode_type"] as const) {
        if (rawOpts[field] !== undefined) options[field] = String(rawOpts[field]);
      }

      const inRaw = rawOpts.input_tokens ?? rawOpts.tokens ?? rawOpts.tokens_thousands ?? rawOpts.input_mtokens;
      let inMtokens: number | undefined;
      if (rawOpts.input_mtokens !== undefined) {
        inMtokens = Number(rawOpts.input_mtokens);
      } else if (rawOpts.tokens_thousands !== undefined) {
        inMtokens = Math.max(1, Math.round(Number(rawOpts.tokens_thousands) / 1000));
      } else if (inRaw !== undefined) {
        const parsed = parseTokens(inRaw);
        if (parsed !== undefined) inMtokens = Math.max(1, Math.round(parsed / 1_000_000));
      }
      if (inMtokens !== undefined) options.input_mtokens = Math.max(1, Math.round(inMtokens));

      const outRaw = rawOpts.output_tokens ?? rawOpts.output_mtokens;
      if (rawOpts.output_mtokens !== undefined) {
        options.output_mtokens = Math.max(1, Math.round(Number(rawOpts.output_mtokens)));
      } else if (outRaw !== undefined) {
        const parsed = parseTokens(outRaw);
        if (parsed !== undefined) options.output_mtokens = Math.max(1, Math.round(parsed / 1_000_000));
      }

      const cachedRaw = rawOpts.cached_tokens ?? rawOpts.cached_input_tokens ?? rawOpts.cached_input_mtokens;
      if (rawOpts.cached_input_mtokens !== undefined) {
        options.cached_input_mtokens = Math.max(1, Math.round(Number(rawOpts.cached_input_mtokens)));
      } else if (cachedRaw !== undefined) {
        const parsed = parseTokens(cachedRaw);
        if (parsed !== undefined) options.cached_input_mtokens = Math.max(1, Math.round(parsed / 1_000_000));
      }

      state.needs = undefined;
      return true;
    }

    default:
      return false;
  }
}
