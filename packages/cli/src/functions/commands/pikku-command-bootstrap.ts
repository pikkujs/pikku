import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'

export type BootstrapInput = {
  allImports: string[]
}

export const pikkuBootstrap = pikkuSessionlessFunc<BootstrapInput, void>({
  func: async ({ logger, config, getInspectorState }, { allImports }) => {
    const stateBeforeBootstrap = await getInspectorState()
    const addonBootstraps: string[] = []

    for (const [, decl] of stateBeforeBootstrap.rpc?.wireAddonDeclarations ??
      []) {
      addonBootstraps.push(`${decl.package}/.pikku/pikku-bootstrap.gen.js`)
      logger.debug(`• Addon bootstrap: ${decl.package}`)
    }

    const localImports = allImports.map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
    )
    const addonImports = addonBootstraps.map(
      (packagePath) => `import '${packagePath}'`
    )

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
        .join('\n')

    await writeFileInDir(logger, config.bootstrapFile, allBootstrapImports)
  },
})
