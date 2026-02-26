import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'

export type BootstrapInput = {
  allImports: string[]
}

type ExternalPackageRuntime = {
  package: string
  rpcEndpoint?: string
}

export const pikkuBootstrap = pikkuSessionlessFunc<BootstrapInput, void>({
  func: async ({ logger, config, getInspectorState }, { allImports }) => {
    const stateBeforeBootstrap = await getInspectorState()
    const externalPackageBootstraps: string[] = []
    const usedExternalPackages: Record<string, ExternalPackageRuntime> = {}

    if (config.externalPackages) {
      for (const [namespace, externalPkg] of Object.entries(
        config.externalPackages
      ) as [
        string,
        { package: string; rpcEndpoint?: string; forceInclude?: boolean },
      ][]) {
        const isUsed =
          stateBeforeBootstrap.rpc?.usedExternalPackages?.has(namespace)
        if (isUsed || externalPkg.forceInclude) {
          const packageName = externalPkg.package
          const packageBootstrap = `${packageName}/.pikku/pikku-bootstrap.gen.js`
          externalPackageBootstraps.push(packageBootstrap)
          usedExternalPackages[namespace] = {
            package: packageName,
            rpcEndpoint: externalPkg.rpcEndpoint,
          }
          logger.debug(
            `• External package ${externalPkg.forceInclude && !isUsed ? 'force-included' : 'detected'}: ${namespace} (${packageName})`
          )
        }
      }
    }

    const localImports = allImports.map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
    )
    const externalImports = externalPackageBootstraps.map(
      (packagePath) => `import '${packagePath}'`
    )

    let externalPackagesRegistration = ''
    if (Object.keys(usedExternalPackages).length > 0) {
      externalPackagesRegistration = `
// Register external package mappings
import { pikkuState } from '@pikku/core/internal'
const externalPackages = pikkuState(null, 'rpc', 'externalPackages')
${Object.entries(usedExternalPackages)
  .map(([ns, cfg]) => {
    const rpcEndpointPart = cfg.rpcEndpoint
      ? `, rpcEndpoint: '${cfg.rpcEndpoint}'`
      : ''
    return `externalPackages.set('${ns}', { package: '${cfg.package}'${rpcEndpointPart} })`
  })
  .join('\n')}
`
    }

    const packageNameArg = config.externalPackageName
      ? `'${config.externalPackageName}'`
      : 'null'
    const metaDirRegistration = `import { pikkuState as __pikkuState } from '@pikku/core/internal'
try {
  const { fileURLToPath: __fileURLToPath } = await import('url')
  const { dirname: __dirname } = await import('path')
  __pikkuState(${packageNameArg}, 'package', 'metaDir', __dirname(__fileURLToPath(import.meta.url)))
} catch {}
`

    const allBootstrapImports =
      metaDirRegistration +
      [...localImports, ...externalImports]
        .sort((a, b) => {
          const aMeta = a.includes('meta')
          const bMeta = b.includes('meta')
          if (aMeta && !bMeta) return -1
          if (!aMeta && bMeta) return 1
          return 0
        })
        .join('\n') +
      externalPackagesRegistration

    await writeFileInDir(logger, config.bootstrapFile, allBootstrapImports)
  },
})
