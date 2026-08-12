/**
 * Bakes the `models` alias table into pikku state at import time.
 *
 * Generated rather than read from pikku.config.json at runtime because a
 * deployed unit never sees that file — it ships the generated code.
 *
 * Whether each agent's declared model actually resolves is checked by the
 * inspector's `validateAgentModels`, which already holds every model literal.
 * This only carries the table across to the runtime.
 */
export const serializeModelAliases = (
  models: Record<string, string> | undefined,
  addonName: string | null
): string => {
  const packageArg = addonName ? `'${addonName}'` : 'null'
  const table = JSON.stringify(models ?? {}, null, 2)
  return `import { pikkuState } from '@pikku/core/ecosystem'

pikkuState(${packageArg}, 'agent', 'modelAliases', ${table})
`
}
