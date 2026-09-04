import type { SugarEngineOptions } from "./types";
import { SugarRegistry } from "./registry";
import { STACK_TRACE_SUGAR_ID } from "./plugins/stack-trace";

/**
 * Forces `stack-trace` on or off without replacing the rest of the sugar set.
 * Empty `enabledSugarIds` means "all defaults"; this helper expands that set
 * before appending the opt-in id.
 */
export function sugarOptionsWithStackTrace(
  options: SugarEngineOptions | undefined,
  enabled: boolean,
): SugarEngineOptions {
  const base: SugarEngineOptions = options ?? { enabled: true };
  const disabled = new Set((base.disabledSugarIds ?? []).map((id) => id.toLowerCase()));
  if (!enabled) {
    disabled.add(STACK_TRACE_SUGAR_ID);
    return { ...base, disabledSugarIds: [...disabled] };
  }

  disabled.delete(STACK_TRACE_SUGAR_ID);
  const defaults = [...SugarRegistry.getDefaultEnabledIds()];
  const explicit =
    base.enabledSugarIds && base.enabledSugarIds.length > 0 ? [...base.enabledSugarIds] : defaults;
  if (!explicit.some((id) => id.toLowerCase() === STACK_TRACE_SUGAR_ID)) {
    explicit.push(STACK_TRACE_SUGAR_ID);
  }
  return {
    ...base,
    enabledSugarIds: explicit,
    disabledSugarIds: [...disabled],
  };
}
