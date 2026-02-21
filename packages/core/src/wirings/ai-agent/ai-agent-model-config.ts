import { pikkuState } from '../../pikku-state.js'

export function resolveModelConfig(
  agentName: string,
  agent: { model: string; temperature?: number; maxSteps?: number }
): { model: string; temperature?: number; maxSteps?: number } {
  const config = pikkuState(null, 'models', 'config') ?? {}
  const models = config.models ?? {}
  const defaults = config.agentDefaults
  const agentOverride = config.agentOverrides?.[agentName]

  let rawModel = agentOverride?.model ?? agent.model

  let aliasTemperature: number | undefined
  let aliasMaxSteps: number | undefined
  if (!rawModel.includes('/')) {
    const entry = models[rawModel]
    if (!entry) throw new Error(`Unknown model alias '${rawModel}'.`)
    if (typeof entry === 'string') {
      rawModel = entry
    } else {
      rawModel = entry.model
      aliasTemperature = entry.temperature
      aliasMaxSteps = entry.maxSteps
    }
  }

  const temperature =
    agentOverride?.temperature ??
    aliasTemperature ??
    defaults?.temperature ??
    agent.temperature
  const maxSteps =
    agentOverride?.maxSteps ??
    aliasMaxSteps ??
    defaults?.maxSteps ??
    agent.maxSteps

  return { model: rawModel, temperature, maxSteps }
}
