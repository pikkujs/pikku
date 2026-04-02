import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

export interface InstalledAddon {
  namespace: string
  packageName: string
  functionCount: number
  agentCount: number
  icon?: string
  tags?: string[]
}

async function readPackageIcon(
  metaService: { readFile: (path: string) => Promise<string | null> },
  packageName: string
): Promise<string | undefined> {
  try {
    const metaDir = pikkuState(packageName, 'package', 'metaDir')
    if (!metaDir) return undefined
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
