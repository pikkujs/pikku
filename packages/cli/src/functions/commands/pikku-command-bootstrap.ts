import { join, dirname } from 'node:path'
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

    const wireAddonFileImports = Array.from(
      stateBeforeBootstrap.rpc?.wireAddonFiles ?? []
    ).map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
    )

    const localImports = allImports.map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
    )
    const addonImports = addonBootstraps.map(
      (packagePath) => `import '${packagePath}'`
    )

    const outDir = dirname(config.bootstrapFile)
    const metaServiceFile = join(outDir, 'pikku-meta-service.gen.ts')
    const metaServiceContent = [
      `import { LocalMetaService } from '@pikku/core/services/local-meta'`,
      ``,
      `export class PikkuMetaService extends LocalMetaService {`,
      `  constructor() {`,
      `    super('${outDir}')`,
      `  }`,
      `}`,
      ``,
    ].join('\n')
    await writeFileInDir(logger, metaServiceFile, metaServiceContent)

    const allBootstrapImports = [
      ...localImports,
      ...wireAddonFileImports,
      ...addonImports,
    ]
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
