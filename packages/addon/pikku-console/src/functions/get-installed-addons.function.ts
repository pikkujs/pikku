import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'
import type { MetaService } from '@pikku/core/services'

export interface InstalledAddon {
  namespace: string
  packageName: string
  functionCount: number
  agentCount: number
  icon?: string
  tags?: string[]
}

async function readPackageIcon(
  metaService: MetaService,
  packageName: string
): Promise<string | undefined> {
  try {
    const factories = pikkuState(packageName, 'package', 'factories')
    if (!factories) return undefined
    const content = await metaService.readFile(
      'console/pikku-addon-meta.gen.json'
    )
    return content
      ? (JSON.parse(content)?.package?.icon ?? undefined)
      : undefined
  } catch {
    return undefined
  }
}

export const getInstalledAddons = pikkuSessionlessFunc<null, InstalledAddon[]>({
  title: 'Get Installed Addons',
  description: 'Returns locally wired addons from pikkuState',
  expose: true,
  auth: false,
  func: async ({ metaService }) => {
    const addonsMap = pikkuState(null, 'addons', 'packages')
    const result: InstalledAddon[] = []
    for (const [namespace, config] of addonsMap) {
      const functions = pikkuState(config.package, 'function', 'meta')
      const agents = pikkuState(config.package, 'agent', 'agentsMeta')
      const icon = await readPackageIcon(metaService, config.package)
      result.push({
        namespace,
        packageName: config.package,
        functionCount: Object.keys(functions ?? {}).length,
        agentCount: Object.keys(agents ?? {}).length,
        icon,
        tags: config.tags,
      })
    }
    return result
  },
})
