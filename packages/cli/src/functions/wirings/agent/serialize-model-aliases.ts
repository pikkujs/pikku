/**
 * Bakes the `models` alias table into pikku state. Generated rather than read
 * at runtime: a deployed unit never sees pikku.config.json.
 */
export const serializeModelAliases = (
  models: Record<string, string> | undefined,
  addonName: string | null
): string => {
  const packageArg = addonName ? `'${addonName}'` : 'null'
  const table = JSON.stringify(models ?? {}, null, 2)
  return `import { pikkuState } from '@pikku/core/state'

pikkuState(${packageArg}, 'agent', 'modelAliases', ${table})
`
}
