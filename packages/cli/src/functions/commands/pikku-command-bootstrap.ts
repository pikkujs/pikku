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

    if (
      config.externalPackages &&
      stateBeforeBootstrap.rpc?.usedExternalPackages?.size > 0
    ) {
      for (const namespace of stateBeforeBootstrap.rpc.usedExternalPackages) {
        const externalPkg = config.externalPackages[namespace]
        if (externalPkg) {
          const packageName = externalPkg.package
          const packageBootstrap = `${packageName}/.pikku/pikku-bootstrap.gen.js`
          externalPackageBootstraps.push(packageBootstrap)
          usedExternalPackages[namespace] = {
            package: packageName,
            rpcEndpoint: externalPkg.rpcEndpoint,
          }
          logger.debug(
            `• External package detected: ${namespace} (${packageName})`
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
import { pikkuState } from '@pikku/core'
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

    const allBootstrapImports =
      [...localImports, ...externalImports]
        .sort((a, b) => {
          const aMeta = a.includes('meta')
          const bMeta = b.includes('meta')
          if (aMeta && !bMeta) return -1
          if (!aMeta && bMeta) return 1
          return 0
        })
        .join('\n') + externalPackagesRegistration

    await writeFileInDir(logger, config.bootstrapFile, allBootstrapImports)
  },
})
