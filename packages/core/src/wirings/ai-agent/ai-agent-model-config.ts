// knowledge: decisions/internals/ai-agent-model-config-stays-a-single-resolution-seam.md
import { pikkuState } from '../../pikku-state.js'

const isProviderQualified = (model: string) => model.includes('/')

/** `PIKKU_MODEL_ALIASES=cheap:openai/gpt-5-mini,tool:anthropic/claude-sonnet-5` */
const envAliases = (): Record<string, string> => {
  const raw = process.env.PIKKU_MODEL_ALIASES
  if (!raw) return {}
  const aliases: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    // First colon only — a model id may contain its own.
    const separator = entry.indexOf(':')
    if (separator === -1) continue
    const alias = entry.slice(0, separator).trim()
    const model = entry.slice(separator + 1).trim()
    if (alias && model) aliases[alias] = model
  }
  return aliases
}

/**
 * Resolves a model name to a concrete `provider/model`. Aliases come from the
 * `models` table in pikku.config.json; a name containing `/` is already
 * concrete. Read from the main package, not the calling addon's — which model
 * a tier points at is the hosting app's decision.
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
