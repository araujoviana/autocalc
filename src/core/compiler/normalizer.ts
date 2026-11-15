/** Translates compiled `version: "1"` NormalizedResources into canonical Quote card records
 * compatible with `validate()`, `plan()`, and `publishQuoteTool()`. */
export {
  SERVICE_ALIASES,
  normalizeServiceAlias,
  normalizeResourceToCards,
  normalizeResourceToCard,
} from "./normalizer/index.ts";
