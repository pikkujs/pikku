import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

export const listDynamicFunctions = pikkuSessionlessFunc<
  null,
  { summaries: { name: string; description: string }[] }
>({
  description: 'Lists all registered functions with their descriptions',
  func: async () => {
    const summaries: { name: string; description: string }[] = []

    const localMeta = pikkuState(null, 'function', 'meta')
    for (const [funcId, meta] of Object.entries(localMeta)) {
      summaries.push({
        name: funcId,
        description: (meta as any).description || (meta as any).title || '',
      })
    }

    const addonsMap = pikkuState(null, 'addons', 'packages')
    for (const [namespace, config] of addonsMap) {
      const addonMeta = pikkuState(config.package, 'function', 'meta')
      for (const [funcId, meta] of Object.entries(addonMeta ?? {})) {
        summaries.push({
          name: `${namespace}:${funcId}`,
          description: (meta as any).description || (meta as any).title || '',
        })
      }
    }

    return { summaries }
  },
})
