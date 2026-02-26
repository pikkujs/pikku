import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'

export type BootstrapInput = {
  allImports: string[]
}

type AddonRuntime = {
  package: string
  rpcEndpoint?: string
}

export const pikkuBootstrap = pikkuSessionlessFunc<BootstrapInput, void>({
  func: async ({ logger, config, getInspectorState }, { allImports }) => {
    const stateBeforeBootstrap = await getInspectorState()
    const addonBootstraps: string[] = []
    const usedAddons: Record<string, AddonRuntime> = {}

    if (config.addons) {
      for (const [namespace, addon] of Object.entries(config.addons) as [
        string,
        { package: string; rpcEndpoint?: string; forceInclude?: boolean },
      ][]) {
        const isUsed = stateBeforeBootstrap.rpc?.usedAddons?.has(namespace)
        if (isUsed || addon.forceInclude) {
          const packageName = addon.package
          const packageBootstrap = `${packageName}/.pikku/pikku-bootstrap.gen.js`
          addonBootstraps.push(packageBootstrap)
          usedAddons[namespace] = {
            package: packageName,
            rpcEndpoint: addon.rpcEndpoint,
          }
          logger.debug(
            `• Addon ${addon.forceInclude && !isUsed ? 'force-included' : 'detected'}: ${namespace} (${packageName})`
          )
        }
      }
    }

    const localImports = allImports.map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
    )
    const addonImports = addonBootstraps.map(
      (packagePath) => `import '${packagePath}'`
    )

    let addonsRegistration = ''
    if (Object.keys(usedAddons).length > 0) {
      addonsRegistration = `
// Register addon mappings
import { pikkuState } from '@pikku/core/internal'
const addons = pikkuState(null, 'rpc', 'addons')
${Object.entries(usedAddons)
  .map(([ns, cfg]) => {
    const rpcEndpointPart = cfg.rpcEndpoint
      ? `, rpcEndpoint: '${cfg.rpcEndpoint}'`
      : ''
    return `addons.set('${ns}', { package: '${cfg.package}'${rpcEndpointPart} })`
  })
  .join('\n')}
`
    }

    const packageNameArg = config.addonName ? `'${config.addonName}'` : 'null'
    const metaDirRegistration = `import { pikkuState as __pikkuState } from '@pikku/core/internal'
try {
  const { fileURLToPath: __fileURLToPath } = await import('url')
  const { dirname: __dirname } = await import('path')
  __pikkuState(${packageNameArg}, 'package', 'metaDir', __dirname(__fileURLToPath(import.meta.url)))
} catch {}
`

    const allBootstrapImports =
      metaDirRegistration +
      [...localImports, ...addonImports]
        .sort((a, b) => {
          const aMeta = a.includes('meta')
          const bMeta = b.includes('meta')
          if (aMeta && !bMeta) return -1
          if (!aMeta && bMeta) return 1
          return 0
        })
        .join('\n') +
      addonsRegistration

    await writeFileInDir(logger, config.bootstrapFile, allBootstrapImports)
  },
})
