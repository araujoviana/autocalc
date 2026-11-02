import { assembleCard, stepper } from "../cards.ts";
import { CONSOLE } from "../endpoints.ts";
import { CalculatorError } from "../errors.ts";
import type { CardInput } from "../schemas.ts";
import { selectProduct } from "./common.ts";
import type { BuilderContext } from "./common.ts";
import { roundPython } from "../rounding.ts";
const display = (value: unknown) => String(value ?? "None");
function imageName(image: Record<string, unknown>): string {
  const value = typeof image.name === "string" ? image.name : "";
  if (value.startsWith("{")) { try { const parsed: unknown = JSON.parse(value); if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>)["en-us"] === "string") return (parsed as Record<string, string>)["en-us"]!; } catch { /* preserve raw name */ } }
  return value;
}
export async function buildEcs(input: Extract<CardInput, { service: "ecs" }>, context: BuilderContext) {
  const spec = /\.(linux|win)$/.test(input.flavor) ? input.flavor : `${input.flavor}.linux`;
  const catalog = await context.productInfo("ecs", input.region);
  const riKey = input.ri_time.replace(/^nodeData\./, ""), riTime = `nodeData.${riKey}`;
  if (input.billing === "ri" && !["1_3", "3_3"].includes(riKey)) throw new CalculatorError("VALIDATION", "Invalid RI term");
  let vm: Record<string, unknown>;
  if (input.billing === "ri") {
    const raw = catalog.product.ec2_vm?.find(p => p.resourceSpecCode === spec && p.RITime === riTime && Array.isArray(p.planList) && p.planList.some(plan => typeof plan === "object" && plan !== null && (plan as Record<string, unknown>).billingMode === "RI"));
    if (!raw) throw new CalculatorError("SPEC_NOT_FOUND", `RI plan for ${spec} not found`);
    vm = structuredClone(raw); const plans = (vm.planList as Record<string, unknown>[]).filter(p => p.billingMode === "RI"); delete vm.planList;
    const byOrigin = new Map(plans.map(plan => [plan.originType, plan]));
    const price = byOrigin.get("price") ?? {}, per = byOrigin.get("perPrice") ?? {}, effective = byOrigin.get("perEffectivePrice") ?? {};
    Object.assign(vm, { bakPlanList: plans, billingMode: "RI", productId: price.productId ?? null, skuCode: price.skuCode ?? null, planId: price.planId ?? null, paymentType: price.paymentType ?? "nodeData.NO_UPFRONT", RITime: price.RITime ?? raw.RITime, price: price.amount ?? null, perPrice: per.amount ?? null, perEffectivePrice: effective.amount ?? null });
  } else vm = await selectProduct(context, "ecs", input.region, "ec2_vm", spec, input.billing, input.hours);
  Object.assign(vm, { addToList_title: "calc_2_", addToList_product: ["arch", "vmType", "spec", "cpu", "mem"].map(key => display(vm[key])).join(" | ") });
  if (input.billing === "ri") vm.addToList_product = ["arch", "vmType", "spec", "cpu", "mem", "paymentType", "RITime"].map(key => display(vm[key])).join(" | ");
  const images = catalog.product["ec2_vm.image.special"] ?? [];
  const matches = (image: Record<string, unknown>) => input.image.toLowerCase().split(/\s+/).every(term => `${display(image.__platform)} ${imageName(image)}`.toLowerCase().includes(term));
  const family = display(vm.spec).split(".")[0];
  const rawImage = images.find(image => matches(image) && Array.isArray(image.type) && image.type.includes(family)) ?? images.find(matches);
  if (!rawImage) throw new CalculatorError("SPEC_NOT_FOUND", `Image ${input.image} not found`);
  const image = structuredClone(rawImage); image.name = imageName(image);
  Object.assign(image, { addToList_title: "calc_4_", addToList_product: `${display(image.__platform)} | ${image.name}` });
  const disks = [input.system_disk, ...(input.data_disks ?? [])], products = input.billing === "ri" ? [image, vm] : [vm, image];
  const diskRows: Array<{ type: string; size: number; token: unknown }> = [];
  for (const [i, [type, size]] of disks.entries()) {
    const disk = await selectProduct(context, "ecs", input.region, "ebs_volume", type, input.billing === "ri" ? "ondemand" : input.billing, input.billing === "ri" ? 730 : input.hours);
    Object.assign(disk, { resourceSize: size, resouceSizeMeasureId: 17, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: i === 0 ? "calc_11_" : "calc_12_", addToList_product: `${display(disk.type)} | ${size}BSSUNIT.${size > 1 ? "pluralUnit" : "unit"}.17`, _productType: i === 0 ? "main" : "addible" });
    if (input.billing === "ri") Object.assign(disk, { measureUnit: 4, measureUnitStep: 1, _injectedMode: "ONDEMAND", cpqPurchaseDuration: 8760, inquiryTag: "combine" });
    products.push(disk); diskRows.push({ type, size, token: disk.type });
  }
  const hasBandwidth = (input.bandwidth_mbit ?? 0) > 0 || input.bandwidth_type === "12_bgp";
  const traffic = input.bandwidth_type === "12_bgp", eipToken = traffic ? "dataInfo_19_" : "dataInfo_18_", measure = traffic ? 10 : 15, size = traffic ? 1 : input.bandwidth_mbit ?? 0;
  if (hasBandwidth) {
    const bw = await selectProduct(context, "ecs", input.region, "vpc_bandwidth", input.bandwidth_type, input.billing === "ri" ? "ondemand" : input.billing, input.billing === "ri" ? 730 : input.hours);
    Object.assign(bw, { eipSpec: "dataInfo_14_", shareType: "dataInfo_16_", eipType: eipToken, name: "dataInfo_14_", resourceSize: input.bandwidth_mbit ?? null, resouceSizeMeasureId: measure, resourceMeasureName: "", resourceMeasurePluralName: "", addToList_title: "calc_5_", addToList_product: `dataInfo_14_ | dataInfo_16_ | ${eipToken} | ${size}BSSUNIT.${size > 1 ? "pluralUnit" : "unit"}.${measure}`, ...(input.billing === "ri" ? { inquiryTag: "combine" } : {}) }); products.push(bw);
  }
  for (const p of products) {
    if (input.billing !== "ri" || p === image || p === vm) { p.productNum = input.quantity; p.selfProductNum = 1; }
    p.inquiryTag = p === image ? "localImage" : input.billing === "ri" && p !== vm ? "combine" : "normal";
  }
  if (input.billing === "ondemand") Object.assign(image, { productNum: Math.trunc(input.quantity * input.hours), transRate: "", transTarget: "", durationNum: input.hours });
  const evs: Record<string, unknown> = { calculator_evs_stepper_main: { type: diskRows[0]!.token, UNSET_Stepper_0: stepper(17, diskRows[0]!.size) } };
  diskRows.slice(1).forEach((disk, index) => { evs[`calculator_evs_stepper_|addible0|_${index}`] = { type: disk.token, UNSET_Stepper_0: stepper(17, disk.size) }; });
  const render: Record<string, unknown> = { calculator_ecs_radio: Object.fromEntries(["arch", "vmType", "generation", "cpu", "mem"].map(key => [key, vm[key] ?? null])), calculator_eip_switch: { UNSET_Switch: hasBandwidth ? "calc_14_" : "calc_15_" }, calculator_ims_select: { __platform: image.__platform, name: image.name }, calculator_evs_stepper: evs };
  if (hasBandwidth) render.calculator_eip_radio = { eipSpec: "dataInfo_14_", shareType: "dataInfo_16_", eipType: eipToken, [traffic ? "UNSET_Stepper_2" : "UNSET_Stepper_1"]: stepper(measure, size) };
  if (input.billing === "ri") {
    render.calculator_ecs_RIRadio = { paymentType: vm.paymentType, RITime: vm.RITime };
    const periodCount = riKey === "1_3" ? 1 : 3, installments = 12 * periodCount;
    return assembleCard({ ...input, periods: periodCount, hours: 730, products, description: "Elastic Cloud Server", rewrite: render, includeTime: false, priceFn: rows => {
      rows.forEach((p, index) => {
        const per = p.inquiryTag === "localImage" ? 0 : typeof p.perPrice === "number" ? p.perPrice * Number(p.productNum ?? 1) : Number(p.amount ?? 0) * 730 * Number(p.resourceSize || 1) * Number(p.productNum ?? 1);
        const monthly = roundPython(per, 6), amount = roundPython(monthly * installments, 6);
        p.inquiryResult = { amount, originalAmount: amount, discountAmount: 0, installNum: installments, perAmount: monthly, perDiscountAmount: 0, perOriginalAmount: 0, installAmount: 0, installPeriodType: 2, id: `RI-${index}-${p.inquiryTag === "localImage" ? "noId" : String(p.productId)}`, productId: p.inquiryTag === "localImage" ? "noId" : p.productId };
      });
    } }, context.rate);
  }
  const period = input.billing === "ondemand" ? "" : `${input.periods}${input.billing === "monthly" ? "m" : "y"}`;
  const buyUrl = `${CONSOLE}?region=${input.region}&locale=en-us&charging=${input.billing === "ondemand" ? 0 : 1}&flavor=${display(vm.spec)}&imageId=${display(image.id)}&sysdisk=${diskRows[0]!.type}:${diskRows[0]!.size}&datadisk=${diskRows.slice(1).map(disk => `${disk.type}:${disk.size}`).join(",")}&iptype=5_bgp&ipcharging=bandwidth&bwsize=${input.bandwidth_mbit ?? 0}&vmcount=${input.quantity}&period=${period}#/ecs/createVm`;
  return assembleCard({ ...input, billing: input.billing, products, description: "Elastic Cloud Server", rewrite: render, buyUrl }, context.rate);
}
