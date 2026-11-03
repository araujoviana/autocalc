/** The card the page builds for a form state, anonymously, in a fresh browser context (port of replay.encode_card). */
import type { BrowserManager } from "../browser.ts";
import { pageEncodeFailed } from "../errors.ts";
import { asPageLike, Driver, type DriverOptions, type PageLike } from "./driver.ts";
import { cardSteps, forPage, formValues, globalValues, PAGE_SERVICE, pricedElsewhere, sameValue } from "./replay.ts";

type Dict = Record<string, any>;
// Safety net: the driver now waits for the region catalog, which was the cause of cards priced in another region.
const TRIES = 3;

export async function encodeCard(manager: BrowserManager, service: string, rewriteValue: Dict, options: { timeout?: number; makeDriver?: (page: PageLike, service: string, options: DriverOptions) => Pick<Driver, "open" | "run" | "capture" | "frontendVersion"> } = {}): Promise<Dict> {
  const wanted = forPage(service, rewriteValue) as Dict;
  let field: string | undefined, card: Dict = {}, frontend: string | undefined;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    card = await manager.withAnonymousContext(async context => {
      const make = options.makeDriver ?? ((page, name, opts) => new Driver(page, name, opts));
      const driver = make(asPageLike(await context.newPage() as never), PAGE_SERVICE[service] ?? service, options.timeout === undefined ? {} : { timeout: options.timeout });
      await driver.open();
      await driver.run(cardSteps(wanted));
      const captured = await driver.capture();
      frontend = driver.frontendVersion;
      return captured;
    }, { lean: true });
    const fail = (message: string, step: string, key: string) => pageEncodeFailed(message, { service, step, field: key, frontendVersion: frontend });
    const asked = Object.fromEntries(Object.entries(globalValues(wanted)).filter(([, value]) => value != null)), got = globalValues(card.rewriteValue as Dict);
    const period = wanted.global_PERIODTIME?.UNSET_PeriodTime;
    if (period) {
      const actual = card.rewriteValue.global_PERIODTIME?.UNSET_PeriodTime ?? {};
      for (const key of ["measureValue", "measureId"]) { asked[`global_PERIODTIME_${key}`] = period[key]; got[`global_PERIODTIME_${key}`] = actual[key]; }
    }
    const lostGlobals = Object.keys(asked).filter(key => !sameValue(asked[key], got[key])).sort();
    if (lostGlobals.length) throw fail("The page's card does not hold the requested quantity or duration.", "globals", lostGlobals[0]!);
    const want = formValues(wanted.template_RENDER), have = formValues(card.rewriteValue.template_RENDER);
    const lost = Object.keys(want).filter(key => !sameValue(have[key], want[key])).sort();
    if (lost.length) throw fail("The page's card does not hold the requested form state.", "form", lost[0]!);
    field = pricedElsewhere(wanted, card);
    if (field === undefined) return card;
  }
  throw pageEncodeFailed(`The page priced the card with ${field} ${JSON.stringify(card.selectedProduct?.[field!])}, not the requested ${JSON.stringify(wanted.global_REGIONINFO[field!])}.`, { service, step: field, field: `global_REGIONINFO_${field}`, frontendVersion: frontend });
}
