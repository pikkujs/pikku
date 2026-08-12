/**
 * Applies `--model cheap:openai/gpt-5-nano,tool:anthropic/claude-haiku-4-5`
 * to a `pikku dev` / `pikku serve` run.
 *
 * The flag repoints an ALIAS, not one agent: that is what makes "run the whole
 * app on a cheap model" a single argument. It is handed to the runtime through
 * `PIKKU_MODEL_ALIASES` rather than codegen because it is meant to last for
 * one run and leave no trace in the generated output.
 */
export const applyModelAliasOverride = (
  logger: { warn: (message: string) => void },
  model: string | undefined,
  configuredAliases: Record<string, string> = {}
): void => {
  if (!model) return

  for (const entry of model.split(',')) {
    const separator = entry.indexOf(':')
    if (separator === -1) {
      throw new Error(
        `--model expects alias:provider/model (e.g. 'cheap:openai/gpt-5-nano'), got '${entry}'.`
      )
    }
    const alias = entry.slice(0, separator).trim()
    if (alias.includes('/')) {
      throw new Error(
        `--model repoints an alias, and '${alias}' is not an alias but a provider-qualified model. Name the alias whose model you want to change, e.g. 'cheap:${entry.slice(separator + 1).trim()}'.`
      )
    }
    // Only a warning: the alias table can legitimately come from an addon or
    // a config this run has not loaded, and refusing would block a debug knob.
    if (
      Object.keys(configuredAliases).length > 0 &&
      !configuredAliases[alias]
    ) {
      logger.warn(
        `--model overrides alias '${alias}', which is not in the "models" table of pikku.config.json (${Object.keys(configuredAliases).sort().join(', ')}) — nothing may use it.`
      )
    }
  }

  process.env.PIKKU_MODEL_ALIASES = model
}
