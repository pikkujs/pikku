import { existsSync } from 'node:fs'
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
      // Remote addons (wireRemoteAddon) run on the host — never import their
      // runtime bootstrap here; that would register their functions locally
      // and drag in the runtime deps remote consumption exists to avoid. The
      // consumer's own wireRemoteAddon() call registers the remote binding.
      if (decl.remote) continue
      addonBootstraps.push(`${decl.package}/.pikku/pikku-bootstrap.gen.js`)
      logger.debug(`• Addon bootstrap: ${decl.package}`)
    }

    const wireAddonFileImports = Array.from(
      stateBeforeBootstrap.rpc?.wireAddonFiles ?? []
    ).map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings, config.forceRelativeImports)}'`
    )

    const localImportTargets = Array.from(
      new Set([
        ...(config.rpcInternalWiringMetaFile &&
        existsSync(config.rpcInternalWiringMetaFile)
          ? [config.rpcInternalWiringMetaFile]
          : []),
        ...allImports,
      ])
    )

    const safeLocalImportTargets = localImportTargets.filter(
      (to): to is string => {
        if (typeof to === 'string' && to.length > 0) return true
        logger.warn(`Skipping invalid bootstrap import path: ${String(to)}`)
        return false
      }
    )

    const localImports = safeLocalImportTargets.map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings, config.forceRelativeImports)}'`
    )
    const addonImports = addonBootstraps.map(
      (packagePath) => `import '${packagePath}'`
    )

    const outDir = dirname(config.bootstrapFile)
    const metaServiceFile = join(outDir, 'pikku-meta-service.gen.ts')
    const escapedOutDir = outDir.replace(/\\/g, '/').replace(/'/g, "\\'")
    const metaServiceContent = [
      `import { LocalMetaService } from '@pikku/core/services/local-meta'`,
      ``,
      `export class PikkuMetaService extends LocalMetaService {`,
      `  constructor() {`,
      `    super('${escapedOutDir}')`,
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
