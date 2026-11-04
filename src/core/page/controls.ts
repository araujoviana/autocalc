/** List the visible controls of a service's calculator page, to write or check a form recipe / schema. */
import type { BrowserManager } from "../browser.ts";
import { asPageLike, Driver } from "./driver.ts";
import { PAGE_SERVICE } from "./replay.ts";
import { LIB } from "./store.ts";

const LIST = LIB + String.raw`
const unit = (p) => (p && (p.measureName || p.measurePluralName)) || null;
const ranges = (vc) => (vc.steppers || []).flatMap((st) => (st.prefixs || []).map((p) => ({
  min: p.min, max: p.max, step: p.step == null ? 1 : p.step, default: p.defaultValue, unit: unit(p),
  when: ((st.rules || [])[0] || {}).resourceSpecCode || null})));
return findAll((i) => {
  const vc = i.props && i.props.viewConfig, n = i.type.__name || '';
  return vc && vc.id && i.props.idHeader && (n.startsWith('base-') || n === 'common-input')
    && n !== 'base-form-group' && visible(i);
}).map((i) => {
  const vc = i.props.viewConfig, r = i.subTree.el.getBoundingClientRect();
  return {id: vc.id, kind: i.type.__name, title: vc.title || null, value_type: vc.valueType || null,
          option_key: vc.optionKey || null, default: plain(vc.defaultValue == null ? null : vc.defaultValue),
          ranges: plain(ranges(vc.steppers ? vc : {steppers: [{prefixs: vc.prefixs}]})),
          y: Math.round(r.top + window.scrollY), x: Math.round(r.left),
          options: (Array.isArray(i.props.sourceData) ? plain(i.props.sourceData) : []).map((o) => o.value)};
});
`;

/** Every visible control: {id, kind, title, ranges, options, ...}. Anonymous; saves nothing. */
export async function pageControls(manager: BrowserManager, service: string): Promise<Array<Record<string, unknown>>> {
  return manager.withAnonymousContext(async context => {
    const page = asPageLike(await context.newPage() as never), driver = new Driver(page, PAGE_SERVICE[service] ?? service);
    await driver.open();
    await page.waitForTimeout(1500); // controls mount just after the form does
    return await page.evaluate(`() => {${LIST}}`) as Array<Record<string, unknown>>;
  }, { lean: true });
}
