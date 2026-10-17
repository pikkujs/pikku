import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  serializeLoadAddons,
  splitAddonBootstrap,
} from './lazy-addon-bootstrap.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'

export type BootstrapInput = {
  allImports: string[]
}

export const pikkuBootstrap = pikkuSessionlessFunc<BootstrapInput, void>({
  func: async ({ logger, config, getInspectorState }, { allImports }) => {
    const stateBeforeBootstrap = await getInspectorState()
    const addonBootstraps: string[] = []
    const deferredAddonImports: string[] = []

    for (const [, decl] of stateBeforeBootstrap.rpc?.wireAddonDeclarations ??
      []) {
      // Remote addons (wireRemoteAddon) run on the host — never import their
      // runtime bootstrap here; that would register their functions locally
      // and drag in the runtime deps remote consumption exists to avoid. The
      // consumer's own wireRemoteAddon() call registers the remote binding.
      if (decl.remote) continue
      const bootstrapSpecifier = `${decl.package}/.pikku/pikku-bootstrap.gen.js`
      const split = config.lazyAddons
        ? await readAddonBootstrap(
            stateBeforeBootstrap.rootDir,
            decl.file,
            decl.package,
            bootstrapSpecifier
          )
        : null
      if (split) {
        addonBootstraps.push(...split.eager)
        deferredAddonImports.push(...split.deferred)
        logger.debug(`• Addon bootstrap (lazy): ${decl.package}`)
      } else {
        addonBootstraps.push(bootstrapSpecifier)
        logger.debug(`• Addon bootstrap: ${decl.package}`)
      }
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
    const metaServiceFile = join(
      outDir,
      'services',
      'pikku-meta-service.gen.ts'
    )
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

    // The meta service used to sit loose at the root of the output dir. A
    // project generated before it moved under `services/` still has that file,
    // and tsc compiles every file in the output tree.
    await rm(join(outDir, 'pikku-meta-service.gen.ts'), { force: true })

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

    await writeFileInDir(
      logger,
      config.bootstrapFile,
      config.lazyAddons
        ? `${allBootstrapImports}\n\n${serializeLoadAddons(deferredAddonImports)}`
        : allBootstrapImports
    )

    // The scenario bootstrap is the only entry point that registers scenarios,
    // features and their steps. It pulls in the app bootstrap first so a runner
    // needs to load one file, and so the meta files it merges onto are already
    // in place however this module is reached.
    const scenarioBootstrapImports = [
      config.bootstrapFile,
      join(config.scenarioSchemaDirectory, 'register.gen.ts'),
      config.scenarioStepsMetaFile,
      config.scenarioStepsFile,
      config.scenarioWiringsMetaFile,
      config.scenarioWiringsFile,
    ].map(
      (to) =>
        `import '${getFileImportRelativePath(config.scenarioBootstrapFile, to, config.packageMappings, config.forceRelativeImports)}'`
    )

    await writeFileInDir(
      logger,
      config.scenarioBootstrapFile,
      scenarioBootstrapImports.join('\n')
    )
  },
})

const readAddonBootstrap = async (
  rootDir: string,
  declFile: string | undefined,
  packageName: string,
  bootstrapSpecifier: string
) => {
  try {
    // Dynamic, like the other inspector uses in this package: a static import
    // would load the TypeScript compiler on every command, `pikku --help`
    // included (startup-imports.test.ts).
    const { addonResolutionDirs, createAddonResolver } =
      await import('@pikku/inspector')
    const path = createAddonResolver(
      addonResolutionDirs(rootDir, declFile)
    ).resolve(bootstrapSpecifier)
    return splitAddonBootstrap(packageName, readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
