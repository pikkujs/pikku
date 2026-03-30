import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'
import { LocalMetaService } from '@pikku/core/services/local-meta'

export interface InstalledAddon {
  namespace: string
  packageName: string
  functionCount: number
  agentCount: number
  icon?: string
  tags?: string[]
}

async function readPackageIcon(
  packageName: string
): Promise<string | undefined> {
  try {
    const metaDir = pikkuState(packageName, 'package', 'metaDir')
    if (!metaDir) return undefined
    const metaService = new LocalMetaService(metaDir)
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
  func: async () => {
    const addonsMap = pikkuState(null, 'addons', 'packages')
    const result: InstalledAddon[] = []
    for (const [namespace, config] of addonsMap) {
      const functions = pikkuState(config.package, 'function', 'meta')
      const agents = pikkuState(config.package, 'agent', 'agentsMeta')
      const icon = await readPackageIcon(config.package)
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
