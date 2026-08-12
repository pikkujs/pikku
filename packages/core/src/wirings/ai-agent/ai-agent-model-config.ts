// knowledge: decisions/internals/ai-agent-model-config-stays-a-single-resolution-seam.md
import { pikkuState } from '../../pikku-state.js'

/**
 * Models are written in one of two forms, told apart by the slash:
 *
 * - `provider/model` — concrete, used exactly as written.
 * - `alias` — a name from the `models` table in pikku.config.json, resolved
 *   here to a concrete model.
 *
 * Aliases name a model by what it is *for* (`cheap`, `tool`, `icon`) so a
 * project can repoint every use of a tier at once. They are optional: an agent
 * that must have one specific model still names it outright.
 */
const isProviderQualified = (model: string) => model.includes('/')

/**
 * `PIKKU_MODEL_ALIASES=cheap:openai/gpt-5-mini,tool:anthropic/claude-sonnet-5`
 *
 * Set by `pikku dev`/`pikku serve` from `--model`, so a local run can move a
 * whole tier without editing the config. Parsed per call rather than cached:
 * this runs once per agent turn, and caching would mean a stale table for the
 * dev server's own in-process reloads.
 */
const envAliases = (): Record<string, string> => {
  const raw = process.env.PIKKU_MODEL_ALIASES
  if (!raw) return {}
  const aliases: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    // Split on the FIRST colon only — the model on the right may contain its
    // own (bedrock-style ids do).
    const separator = entry.indexOf(':')
    if (separator === -1) continue
    const alias = entry.slice(0, separator).trim()
    const model = entry.slice(separator + 1).trim()
    if (alias && model) aliases[alias] = model
  }
  return aliases
}

/**
 * Resolves a model name to a concrete `provider/model`.
 *
 * The alias table is read from the main package rather than the calling
 * addon's: which model a tier points at is the hosting app's decision, so an
 * addon's agents follow the app they are installed into.
 */
export const resolveModelAlias = (model: string): string => {
  if (isProviderQualified(model)) return model

  const generated = pikkuState(null, 'agent', 'modelAliases')
  const override = envAliases()[model]
  const resolved = override ?? generated[model]

  if (!resolved) {
    const known = Object.keys({ ...generated, ...envAliases() }).sort()
    throw new Error(
      `Unknown model alias '${model}'. ` +
        (known.length
          ? `Known aliases: ${known.join(', ')}. `
          : `No aliases are configured. `) +
        `Add it to the "models" table in pikku.config.json, or name a ` +
        `provider-qualified model such as 'openai/gpt-5-mini'.`
    )
  }

  return resolved
}

export function resolveModelConfig(
  _agentName: string,
  agent: { model: string; temperature?: number; maxSteps?: number }
): { model: string; temperature?: number; maxSteps?: number } {
  return {
    model: resolveModelAlias(agent.model),
    temperature: agent.temperature,
    maxSteps: agent.maxSteps,
  }
}
