import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

const EXCLUDED_PREFIXES = [
  'pikkuWorkflow',
  'pikkuRemote',
  'pikkuConsole',
  'http:',
  'graphStart:',
]

const EXCLUDED_ADDONS = new Set(['console', 'dynamic-workflows'])

function shouldInclude(funcId: string, meta: any): boolean {
  if (EXCLUDED_PREFIXES.some((p) => funcId.startsWith(p))) return false
  if ((meta as any).functionType !== 'user') return false
  if ((meta as any).expose === false) return false
  return true
}

export const listDynamicFunctions = pikkuSessionlessFunc<
  null,
  { summaries: { name: string; description: string }[] }
>({
  description:
    'Lists all registered functions available for workflow generation',
  func: async () => {
    const summaries: { name: string; description: string }[] = []

    const localMeta = pikkuState(null, 'function', 'meta')
    for (const [funcId, meta] of Object.entries(localMeta)) {
      if (!shouldInclude(funcId, meta)) continue
      summaries.push({
        name: funcId,
        description: (meta as any).description || (meta as any).title || '',
      })
    }

    const addonsMap = pikkuState(null, 'addons', 'packages')
    for (const [namespace, config] of addonsMap) {
      if (EXCLUDED_ADDONS.has(namespace)) continue
      const addonMeta = pikkuState(config.package, 'function', 'meta')
      for (const [funcId, meta] of Object.entries(addonMeta ?? {})) {
        if (!shouldInclude(funcId, meta)) continue
        summaries.push({
          name: `${namespace}:${funcId}`,
          description: (meta as any).description || (meta as any).title || '',
        })
      }
    }

    return { summaries }
  },
})
