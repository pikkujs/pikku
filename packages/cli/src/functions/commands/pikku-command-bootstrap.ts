import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'

export type BootstrapInput = {
  allImports: string[]
}

export const pikkuBootstrap = pikkuSessionlessFunc<BootstrapInput, void>({
  func: async ({ logger, config, getInspectorState }, { allImports }) => {
    const stateBeforeBootstrap = await getInspectorState()
    const externalPackageBootstraps: string[] = []
    const usedExternalPackages: Record<string, string> = {}

    if (
      config.externalPackages &&
      stateBeforeBootstrap.rpc?.usedExternalPackages?.size > 0
    ) {
      for (const namespace of stateBeforeBootstrap.rpc.usedExternalPackages) {
        const packageName = config.externalPackages[namespace]
        if (packageName) {
          const packageBootstrap = `${packageName}/.pikku/pikku-bootstrap.gen.js`
          externalPackageBootstraps.push(packageBootstrap)
          usedExternalPackages[namespace] = packageName
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
  .map(([ns, pkg]) => `externalPackages.set('${ns}', '${pkg}')`)
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
