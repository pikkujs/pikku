import { pikkuSessionlessFunc } from '#pikku'
import type { FunctionMeta } from '../services/wiring.service.js'

export const getFunctionsMeta = pikkuSessionlessFunc<null, FunctionMeta[]>({
  title: 'Get Functions Metadata',
  description:
    'Reads function metadata from metaService and returns it as a flat array of FunctionMeta objects, enriched with version info from the versions manifest if available.',
  expose: true,
  auth: false,
  func: async ({ metaService }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const functionsMeta = await metaService.getFunctionsMeta()
    const functions = Object.values(functionsMeta)

    let versions: Record<string, { latest: number }> | null = null
    try {
      const manifestPath = join(
        metaService.basePath!,
        '..',
        'versions.pikku.json'
      )
      const content = await readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content)
      versions = manifest.contracts || null
    } catch {
      // versions not enabled
    }

    if (versions) {
      for (const func of functions) {
        const funcId = (func as any).pikkuFuncId || (func as any).pikkuFuncName
        const versionInfo = versions[funcId]
        if (versionInfo) {
          ;(func as any).version = versionInfo.latest
        }
      }
    }

    return functions
  },
})
