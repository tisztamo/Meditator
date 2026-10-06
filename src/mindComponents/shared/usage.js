// Model spend as a message (review §2.3, §7 step 9).
//
// Before this, llm.js kept one process-wide usage accumulator and m-economy read
// it at every boundary, so in a society every mind's metabolism was charged for
// everyone's spend. Now the model layer only returns what a call cost, and the
// component that made the call says so:
//
//   usage {promptTokens, completionTokens, cost, estimated?}      (bubbling)
//
// One event per call, also for a call that reported no usage (it still counts as
// a request). An economy hears it on its own membrane, so it is charged for what
// is spent inside that membrane and nothing else. The membrane does not stop it:
// a mind pays for what its hands spend, a sub-agent's calls included, and an
// economy further out (a society's) would hear its members' spend too.
//
// `cost` is USD as the provider reports it (OpenRouter, the decision transport);
// an economy estimates from tokens when no call reported one.
//
// Spend is bookkeeping, so it carries only the implicit infoton dose.

import { ENERGY } from "./infoton.js"

export const USAGE_EVENT = "usage"

/** The plain record of one call's usage (a provider's snake_case or null). */
export function usageRecord(usage) {
  const record = {
    promptTokens: Number(usage?.prompt_tokens) || 0,
    completionTokens: Number(usage?.completion_tokens) || 0,
    cost: typeof usage?.cost === "number" ? usage.cost : 0,
  }
  if (usage?.estimated) record.estimated = true
  return record
}

/** Fire one call's usage from `el` (an MBaseComponent), the component that made it. */
export function spend(el, usage) {
  el.fire(USAGE_EVENT, usageRecord(usage), { energy: ENERGY.implicit })
}

/**
 * `spend()` for a call's result, passed through: `const r = spent(this, await complete(…))`.
 * A soft-failed decide() (null) made no billable call and fires nothing.
 */
export function spent(el, result) {
  if (result) spend(el, result.usage)
  return result
}
