import { CardInput } from "../schemas.ts";
import { CalculatorError } from "../errors.ts";
import type { BuilderContext } from "./common.ts";
import { buildEcs } from "./ecs.ts"; import { buildEvs } from "./evs.ts"; import { buildCce } from "./cce.ts"; import { buildObs } from "./obs.ts"; import { buildRds } from "./rds.ts"; import { buildSfs } from "./sfs.ts"; import { buildElb } from "./elb.ts"; import { buildNat } from "./nat.ts"; import { buildApig } from "./apig.ts"; import { buildDline } from "./dline.ts"; import { buildCbr } from "./cbr.ts"; import { buildApm } from "./apm.ts"; import { buildWaf } from "./waf.ts"; import { buildFunction } from "./function.ts"; import { buildDew } from "./dew.ts"; import { buildLts } from "./lts.ts"; import { buildCci } from "./cci.ts"; import { buildRabbitmq } from "./rabbitmq.ts"; import { buildKafka } from "./kafka.ts"; import { buildNosql } from "./nosql.ts"; import { buildEip } from "./eip.ts"; import { buildRedis } from "./redis.ts";
import { RECIPES } from "./forms.ts";
import { supportedServices } from "./publication.ts";
export { supportedServices };

export async function buildCard(rawInput: CardInput, context: BuilderContext) {
  const parsed = CardInput.safeParse(rawInput);
  if (!parsed.success) throw new CalculatorError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid card input");
  const input = parsed.data;
  switch (input.service) {
    case "ecs": return buildEcs(input, context); case "evs": return buildEvs(input, context); case "cce": return buildCce(input, context); case "obs": return buildObs(input, context); case "rds": return buildRds(input, context); case "sfsturbo": return buildSfs(input, context); case "elb": return buildElb(input, context); case "nat": return buildNat(input, context); case "apig": return buildApig(input, context); case "dline": return buildDline(input, context); case "cbr": return buildCbr(input, context); case "apm": return buildApm(input, context); case "waf": return buildWaf(input, context); case "function": return buildFunction(input, context); case "dew": return buildDew(input, context); case "lts": return buildLts(input, context); case "cci": return buildCci(input, context); case "rabbitmq": return buildRabbitmq(input, context); case "kafka": return buildKafka(input, context); case "nosql": return buildNosql(input, context); case "eip": return buildEip(input, context); case "redis": return buildRedis(input, context);
  }
}
