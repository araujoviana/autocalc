import { roundPython } from "./rounding.ts";
type Dict = Record<string, unknown>;
const object = (value: unknown): Dict => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Dict : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function scanNonfinite(value: unknown): string[] {
  const issues: string[] = [];
  const walk = (item: unknown, path: string): void => {
    if (Array.isArray(item)) item.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (item !== null && typeof item === "object") for (const [key, v] of Object.entries(item)) walk(v, path ? `${path}.${key}` : key);
    else if ((typeof item === "number" && !Number.isFinite(item)) || (typeof item === "string" && ["nan", "undefined", "infinity", "-inf"].includes(item.trim().toLowerCase()))) issues.push(`${path}: ${String(item)} is not a finite value`);
  };
  walk(value, "");
  return issues;
}
export function validateList(data: Dict): { ok: boolean; items: number; total: number; issues: string[] } {
  const issues = scanNonfinite(data);
  const items = Array.isArray(data.cartListData) ? data.cartListData : Array.isArray(data.items) ? data.items : "selectedProduct" in data ? [data] : [];
  let total = 0;
  items.forEach((raw, i) => {
    const item = object(raw), selected = object(item.selectedProduct);
    const tag = String(selected._customTitle ?? selected.serviceCode ?? `item ${i}`);
    for (const key of ["region", "chargeMode", "chargeModeName", "serviceCode", "productAllInfos", "amount", "originalAmount"]) if (!(key in selected)) issues.push(`[${tag}] selectedProduct.${key} missing`);
    const products = array(selected.productAllInfos);
    if (!products.length) issues.push(`[${tag}] has no products`);
    let sum = 0;
    const indices: number[] = [];
    products.forEach(rawProduct => {
      const product = object(rawProduct), spec = String(product.resourceSpecCode ?? product.name ?? product.id ?? "?");
      const required = "resourceSpecCode" in product ? ["resourceSpecCode", "resourceType", "productNum", "inquiryTag", "selectIndex", "addToList_product"] : ["inquiryTag", "productNum", "selectIndex", "addToList_product"];
      for (const key of required) if (!(key in product)) issues.push(`[${tag}] product ${spec}: ${key} missing`);
      if (!finite(product.productNum) || product.productNum <= 0) issues.push(`[${tag}] product ${spec}: productNum invalid`);
      if (typeof product.selectIndex === "number" && Number.isInteger(product.selectIndex)) indices.push(product.selectIndex);
      else issues.push(`[${tag}] product ${spec}: selectIndex invalid`);
      const inquiry = object(product.inquiryResult);
      if (!Object.keys(inquiry).length) issues.push(`[${tag}] product ${spec}: no inquiryResult`);
      else {
        if (!finite(inquiry.amount)) issues.push(`[${tag}] product ${spec}: inquiryResult.amount invalid`); else sum += inquiry.amount;
        if (!finite(inquiry.originalAmount)) issues.push(`[${tag}] product ${spec}: inquiryResult.originalAmount invalid`);
      }
    });
    if (!finite(selected.amount)) issues.push(`[${tag}] selectedProduct.amount invalid`);
    else { if (Math.abs(selected.amount - sum) > 0.02) issues.push(`[${tag}] card amount ${selected.amount} != sum(products) ${sum}`); total += selected.amount; }
    if (!finite(selected.originalAmount)) issues.push(`[${tag}] selectedProduct.originalAmount invalid`);
    if (indices.length && (indices.length !== products.length || indices.some((n, index) => n !== index))) issues.push(`[${tag}] selectIndex not 0..n-1`);
    if (selected.serviceCode === "ecs") {
      const form = object(object(item.rewriteValue).template_RENDER), toggle = object(form.calculator_eip_switch).UNSET_Switch;
      const hasBandwidth = products.some(p => String(object(p).resourceType ?? "").endsWith("bandwidth"));
      if (!hasBandwidth && toggle !== "calc_15_") issues.push(`[${tag}] no bandwidth product but form state does not say no public IP`);
      if (hasBandwidth && toggle !== "calc_14_") issues.push(`[${tag}] bandwidth product present but form state does not say public IP is assigned`);
      if (hasBandwidth && !form.calculator_eip_radio) issues.push(`[${tag}] bandwidth product present but EIP form state is missing`);
    }
    if (selected.chargeModeName === "RI") for (const key of ["perAmount", "installAmount", "perDiscountAmount", "perOriginalAmount"]) if (!finite(selected[key])) issues.push(`[${tag}] RI card has invalid or missing selected-level ${key}`);
  });
  const listTotal = typeof data.totalPrice === "object" ? object(data.totalPrice).amount : data.totalPrice;
  if (listTotal !== undefined && listTotal !== null && (!finite(listTotal) || Math.abs(listTotal - total) > 0.02)) issues.push(`totalPrice ${String(listTotal)} != sum(items) ${total}`);
  return { ok: issues.length === 0, items: items.length, total: roundPython(total, 6), issues };
}
