export const PAGE = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html";
export const API = "https://portal-intl.huaweicloud.com/api";
export const CALC = `${API}/calculator/rest/cbc/portalcalculatornodeservice/v4/api`;
export const CDN = "https://res-static.hc-cdn.cn/pricecalculator/intl/product";
export const RATE = `${API}/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource`;
export const FX = `${API}/cbc/global/rest/cbc/csbpaymentservice/v1/exchange-rate`;
export const MASK = "https://www.huaweicloud.com/intl/en-us/pricing/index/islogin";
export const CONSOLE = "https://console-intl.huaweicloud.com/ecm/";
export const vendorServiceCode = (service: string): string => service.toLowerCase() === "rabbitmq" ? "rabbitMQ" : service;

function withQuery(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
export const endpoints = {
  menu: (language = "en-us") => withQuery(`${CALC}/menuInfo`, { sign: "common", language }),
  cdnMenu: (language = "en-us") => `${CDN}/common_${encodeURIComponent(language)}_menuInfo.json`,
  product: (service: string, region: string) => withQuery(`${CALC}/productInfo`, {
    urlPath: service, tag: "general.online.portal", region, tab: "calc", sign: "common",
  }),
  cdnProduct: (service: string, region: string) => `${CDN}/${encodeURIComponent(service)}_general.online.portal_${encodeURIComponent(region)}_calc_productInfo.json`,
  labels: (language = "en-us") => withQuery(`${CALC}/language`, { urlPath: "all", language }),
  detail: (id: string) => withQuery(`${CALC}/share/detail`, { key: id, language: "en-us" }),
  list: `${CALC}/share/list`, add: `${CALC}/share/add`,
  update: (id: string) => withQuery(`${CALC}/share/update`, { key: id }),
  delete: (id: string) => withQuery(`${CALC}/share/delete`, { key: id }),
  copy: (id: string) => withQuery(`${CALC}/share/copy`, { key: id }),
  exchangeRates: (page: number) => withQuery(FX, { page_no: String(page), page_size: "100" }),
};
export function shareLink(id: string, currency = "USD"): string {
  return withQuery(PAGE, { shareListId: id, currentCurrency: currency.toUpperCase() });
}
