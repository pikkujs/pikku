/**
 * Applies `--model cheap:openai/gpt-5-nano` to a `pikku dev` / `pikku serve`
 * run, via PIKKU_MODEL_ALIASES so it leaves no trace in generated output.
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
    // A warning, not an error: the table may come from an addon config this
    // run has not loaded.
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
