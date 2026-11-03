import type { CardInput } from "../schemas.ts";
import type { BuilderContext } from "./common.ts";
import { buildEcs } from "./ecs.ts"; import { buildEvs } from "./evs.ts"; import { buildCce } from "./cce.ts"; import { buildObs } from "./obs.ts"; import { buildRds } from "./rds.ts"; import { buildSfs } from "./sfs.ts"; import { buildElb } from "./elb.ts"; import { buildNat } from "./nat.ts"; import { buildApig } from "./apig.ts"; import { buildDline } from "./dline.ts"; import { buildCbr } from "./cbr.ts"; import { buildApm } from "./apm.ts"; import { buildWaf } from "./waf.ts"; import { buildFunction } from "./function.ts"; import { buildDew } from "./dew.ts"; import { buildLts } from "./lts.ts"; import { buildCci } from "./cci.ts"; import { buildRabbitmq } from "./rabbitmq.ts"; import { buildKafka } from "./kafka.ts"; import { buildNosql } from "./nosql.ts"; import { buildEip } from "./eip.ts"; import { buildRedis } from "./redis.ts";
import { ACCEPTED_DEFAULT_ONLY, RECIPES } from "./forms.ts";
import { legalOptions, SPEC_ARG, VERIFIED, VERIFIED_FRONTEND } from "./publication.ts";

const builderDescriptions: Record<string, string> = {
  ecs: "Elastic Cloud Server", evs: "Elastic Volume Service", cce: "Cloud Container Engine", obs: "Object Storage Service",
  rds: "Relational Database Service", sfsturbo: "Scalable File Service Turbo", elb: "Elastic Load Balance", nat: "NAT Gateway",
  apig: "API Gateway", dline: "Cloud Connect / Direct Connect As A Service", cbr: "Cloud Backup and Recovery",
  apm: "Application Performance Management", waf: "Web Application Firewall", function: "FunctionGraph",
  dew: "Data Encryption Workshop", lts: "Log Tank Service", cci: "Cloud Container Instance",
  rabbitmq: "DMS (for RabbitMQ)", kafka: "DMS (for Kafka)", nosql: "GeminiDB DynamoDB",
};
const onDemand = new Set(["nat", "apig", "apm", "waf", "function", "dew", "lts", "cci"]);
const onDemandFirst = new Set(["evs", "cce", "obs", "rds", "sfsturbo", "elb", "cbr"]);

export function supportedServices() {
  const all = new Set([...Object.keys(builderDescriptions), ...Object.keys(RECIPES)]);
  return [...all].sort((a, b) => a.localeCompare(b)).map(service => {
    const recipe = RECIPES[service];
    const description = recipe ? recipe.description : builderDescriptions[service]!;
    const modes = recipe
      ? [...recipe.modes]
      : onDemand.has(service)
        ? ["ondemand"]
        : service === "dline"
          ? ["monthly", "yearly"]
          : onDemandFirst.has(service)
            ? ["ondemand", "monthly", "yearly"]
            : ["monthly", "yearly", "ondemand"];
    let reason: string | null = null;
    if (ACCEPTED_DEFAULT_ONLY.has(service)) {
      reason = "Only page defaults have been accepted; requested configuration is unverified.";
    } else if (service === "function" || service === "lts") {
      reason = "Incomplete pricing or form mapping; publication remains blocked.";
    } else if (service in RECIPES && !SPEC_ARG[service]) {
      reason = "Selected catalog specs have no verified form mapping.";
    } else if (!VERIFIED.has(service)) {
      reason = "No verified page publication support.";
    }
    return {
      publication_supported: reason === null,
      publication_blocked_reason: reason,
      verified_frontend: VERIFIED.has(service) ? VERIFIED_FRONTEND : null,
      service,
      modes,
      description,
      options: legalOptions(service) ?? [],
    };
  });
}

export async function buildCard(input: CardInput, context: BuilderContext) {
  switch (input.service) {
    case "ecs": return buildEcs(input, context); case "evs": return buildEvs(input, context); case "cce": return buildCce(input, context); case "obs": return buildObs(input, context); case "rds": return buildRds(input, context); case "sfsturbo": return buildSfs(input, context); case "elb": return buildElb(input, context); case "nat": return buildNat(input, context); case "apig": return buildApig(input, context); case "dline": return buildDline(input, context); case "cbr": return buildCbr(input, context); case "apm": return buildApm(input, context); case "waf": return buildWaf(input, context); case "function": return buildFunction(input, context); case "dew": return buildDew(input, context); case "lts": return buildLts(input, context); case "cci": return buildCci(input, context); case "rabbitmq": return buildRabbitmq(input, context); case "kafka": return buildKafka(input, context); case "nosql": return buildNosql(input, context); case "eip": return buildEip(input, context); case "redis": return buildRedis(input, context);
  }
}
