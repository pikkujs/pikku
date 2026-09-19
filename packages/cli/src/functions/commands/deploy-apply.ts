import { basename, isAbsolute, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku/function'
import type { ProviderAdapter, EntryGenerationContext } from '@pikku/deploy'
import type { InspectorState } from '@pikku/inspector'
import type { Logger } from '@pikku/core/services'
import {
  runBuildPipeline,
  describeBuildFailure,
  PikkuDeployBuildFailedError,
} from '../../deploy/build-pipeline.js'

function toRelativeImport(fromDir: string, toFile: string): string {
  let rel = relative(fromDir, toFile).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel.replace(/\.ts$/, '.js')
}

export function getEntryContext(
  unitDir: string,
  pikkuDir: string,
  unit: EntryGenerationContext['unit'],
  inspectorState: InspectorState
): EntryGenerationContext {
  const bootstrapRelative = relative(
    unitDir,
    join(pikkuDir, 'pikku-bootstrap.gen.js')
  )
  const bootstrapPath =
    bootstrapRelative.startsWith('./') || bootstrapRelative.startsWith('../')
      ? bootstrapRelative
      : `./${bootstrapRelative}`

  const {
    pikkuConfigFactory,
    singletonServicesFactory,
    singletonServicesType,
  } = inspectorState.filesAndMethods

  if (!pikkuConfigFactory || !singletonServicesFactory) {
    throw new Error(
      'Cannot generate deploy entries: createConfig and createSingletonServices must be defined in your project'
    )
  }

  const configRelative = toRelativeImport(unitDir, pikkuConfigFactory.file)
  const servicesRelative = toRelativeImport(
    unitDir,
    singletonServicesFactory.file
  )

  const singletonServicesImport = singletonServicesType
    ? `import type { ${singletonServicesType.type} } from '${toRelativeImport(unitDir, singletonServicesType.typePath)}'`
    : ''
  const servicesType = singletonServicesType
    ? `Partial<${singletonServicesType.type}>`
    : 'Record<string, unknown>'

  // MCP: when the unit's surface manifest is non-empty, import it and pass it
  // to the generated server so it mounts the surface. Without this the deployed
  // bundle never serves MCP even though the dev server does.
  //
  // An `mcp` unit serves exactly the one surface it was emitted for — its name
  // carries that surface's slug, which is also the manifest's filename. Any
  // other unit (a monolith, say) serves the default surface, as before.
  let mcpImport = ''
  let mcpServerOption = ''
  const mcpSlug =
    unit.role === 'mcp' && unit.name !== 'mcp-server'
      ? unit.name.replace(/^mcp-/, '')
      : undefined
  const mcpJsonAbs = join(
    pikkuDir,
    'mcp',
    mcpSlug ? `mcp.${mcpSlug}.gen.json` : 'mcp.gen.json'
  )
  if (existsSync(mcpJsonAbs)) {
    let hasMcp = false
    let mcpPath = '/mcp'
    try {
      const parsed = JSON.parse(readFileSync(mcpJsonAbs, 'utf-8')) as {
        mcpPath?: string
        tools?: unknown[]
        resources?: unknown[]
        prompts?: unknown[]
      }
      hasMcp =
        (parsed.tools?.length ?? 0) +
          (parsed.resources?.length ?? 0) +
          (parsed.prompts?.length ?? 0) >
        0
      mcpPath = parsed.mcpPath ?? mcpPath
    } catch (err) {
      console.warn(
        `[pikku] could not parse ${mcpJsonAbs} — skipping MCP mount: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    if (hasMcp) {
      const rel = relative(unitDir, mcpJsonAbs).replace(/\\/g, '/')
      const relImport = rel.startsWith('.') ? rel : `./${rel}`
      mcpImport = `import mcpJson from '${relImport}' with { type: 'json' }`
      mcpServerOption =
        mcpPath === '/mcp'
          ? 'mcpJson, '
          : `mcpJson, mcpPath: ${JSON.stringify(mcpPath)}, `
    }
  }

  return {
    unit,
    unitDir,
    bootstrapPath,
    configImport: `import { ${pikkuConfigFactory.variable} } from '${configRelative}'`,
    configVar: pikkuConfigFactory.variable,
    servicesImport: `import { ${singletonServicesFactory.variable} } from '${servicesRelative}'`,
    servicesVar: singletonServicesFactory.variable,
    singletonServicesImport,
    servicesType,
    mcpImport,
    mcpServerOption,
  }
}

function sanitizeProjectId(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'pikku-project'
  )
}

async function resolveProjectId(projectDir: string): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(join(projectDir, 'package.json'), 'utf-8')
    )
    if (pkg.name) {
      const name = pkg.name.replace(/^@[^/]+\//, '')
      return sanitizeProjectId(name)
    }
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (err?.code !== 'ENOENT') {
      console.warn(`Warning: failed to read package.json: ${err?.message ?? e}`)
    }
  }
  return sanitizeProjectId(basename(projectDir))
}

/**
 * A deploy provider is a dependency of the project being deployed, which is
 * what the "is not installed" error asks the user to add. A bare
 * `import(packageName)` resolves from the CLI's own location instead, and only
 * found the provider because yarn hoisted every workspace package to a shared
 * root. An isolated node_modules layout (bun, pnpm) gives the CLI only what the
 * CLI declares, so the provider has to be resolved against the project.
 *
 * Only an absolute path counts as having resolved to the project's own copy: a
 * configured provider may also be a URL, and a runtime whose `require.resolve`
 * hands a bare specifier straight back for its own built-ins has resolved
 * nothing. Both of those import as written.
 *
 * `require.resolve` applies the `require` condition, so an ESM-only provider —
 * one whose exports map offers `types` and `import` and nothing else, which is
 * a perfectly ordinary way to publish — does not resolve there even though it
 * is installed and importable. Falling through to the bare import does not
 * rescue it, because that resolves from the CLI rather than the project, so
 * `resolveEsmOnlyEntry` reads the package's own entry instead. It has to walk
 * the resolution paths by hand: the exports map that blocked the package also
 * blocks `<name>/package.json`.
 *
 * Which is why it runs on any resolution failure rather than on one code. Node
 * reports this as ERR_PACKAGE_PATH_NOT_EXPORTED and bun as a plain
 * MODULE_NOT_FOUND, indistinguishable from a package that is genuinely absent.
 * Telling them apart is what the filesystem is for: a package that is not there
 * yields no entry and the bare import still runs, unchanged.
 */
/**
 * The conditions that are true for the `import()` this resolution ends in.
 * `default` matches unconditionally and is handled by the resolver rather than
 * listed here, because node treats it as the fallthrough rather than as a name.
 */
const ACTIVE_EXPORT_CONDITIONS = new Set(['node', 'import'])

/**
 * Picks an export target the way node does: a conditions object is walked in
 * DECLARATION order and the first key that is active wins, nesting included.
 *
 * The order is the package author's, not ours. `{ "import": { "node": "./n.js",
 * "default": "./browser.js" } }` resolves to `./n.js`, because `node` is listed
 * first and is true here — preferring a fixed list of condition names instead
 * would hand back the browser build and load a different provider than the one
 * node would have.
 *
 * An array is a list of fallbacks, and `null` is a deliberate block, so both
 * carry on to the next candidate rather than ending the walk.
 */
const resolveExportTarget = (target: unknown): string | undefined => {
  if (typeof target === 'string') return target
  if (target === null || target === undefined) return undefined
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const resolved = resolveExportTarget(candidate)
      if (resolved !== undefined) return resolved
    }
    return undefined
  }
  if (typeof target !== 'object') return undefined
  for (const [condition, value] of Object.entries(target)) {
    if (condition !== 'default' && !ACTIVE_EXPORT_CONDITIONS.has(condition)) {
      continue
    }
    const resolved = resolveExportTarget(value)
    if (resolved !== undefined) return resolved
  }
  return undefined
}

/**
 * The entry an exports map offers to `import`, or, for a package with no
 * exports map at all, its legacy main. A map that deliberately omits a root
 * entry offers nothing: falling back to `main` there would reach past the
 * encapsulation the package asked for, so this reports no entry and the caller
 * treats the provider as missing.
 */
const esmEntryFromManifest = (manifest: any): string | undefined => {
  const exportsField = manifest.exports
  if (exportsField === undefined || exportsField === null) {
    const legacy = manifest.module ?? manifest.main
    return typeof legacy === 'string' ? legacy : undefined
  }
  const isSubpathMap =
    typeof exportsField === 'object' &&
    !Array.isArray(exportsField) &&
    Object.keys(exportsField).some((key) => key.startsWith('.'))
  const root = isSubpathMap ? exportsField['.'] : exportsField
  return resolveExportTarget(root)
}

const resolveEsmOnlyEntry = (
  require: NodeRequire,
  packageName: string
): string | undefined => {
  const searchPaths = require.resolve.paths(packageName) ?? []
  for (const searchPath of searchPaths) {
    const packageJsonPath = join(searchPath, packageName, 'package.json')
    if (!existsSync(packageJsonPath)) continue
    let manifest: any
    try {
      manifest = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    } catch {
      return undefined
    }
    const entry = esmEntryFromManifest(manifest)
    if (!entry) return undefined
    return join(searchPath, packageName, entry)
  }
  return undefined
}

const importProviderPackage = async (
  packageName: string,
  projectDir?: string
): Promise<any> => {
  const require = createRequire(
    join(projectDir ?? process.cwd(), 'package.json')
  )
  try {
    const resolved = require.resolve(packageName)
    if (isAbsolute(resolved)) {
      return await import(pathToFileURL(resolved).href)
    }
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (
      err?.code !== 'ERR_MODULE_NOT_FOUND' &&
      err?.code !== 'MODULE_NOT_FOUND' &&
      err?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      throw e
    }
    const entry = resolveEsmOnlyEntry(require, packageName)
    if (entry && existsSync(entry)) {
      return await import(pathToFileURL(entry).href)
    }
  }
  return await import(packageName)
}

export async function resolveProvider(
  config?: {
    deploy?: { providers: Record<string, string>; defaultProvider?: string }
  },
  providerName?: string,
  options?: {
    runtime?: string
    desktop?: boolean
    projectDir?: string
    desktopIdentifier?: string
    desktopUrl?: string
  }
): Promise<ProviderAdapter> {
  const name = providerName ?? config?.deploy?.defaultProvider ?? 'cloudflare'

  const providers = config?.deploy?.providers ?? {
    cloudflare: '@pikku/deploy-cloudflare',
    serverless: '@pikku/deploy-serverless',
    azure: '@pikku/deploy-azure',
    standalone: '@pikku/deploy-standalone',
  }

  const packageName = providers[name]
  if (!packageName) {
    throw new Error(
      `Unknown deploy provider: '${name}'. Available: ${Object.keys(providers).join(', ')}`
    )
  }

  const adapterExportName =
    name.charAt(0).toUpperCase() + name.slice(1) + 'ProviderAdapter'

  try {
    const mod = await importProviderPackage(packageName, options?.projectDir)
    if (typeof mod.createAdapter === 'function') {
      return mod.createAdapter(options)
    }
    if (typeof mod[adapterExportName] === 'function') {
      return new mod[adapterExportName](options)
    }
    throw new Error(
      `Deploy provider '${packageName}' does not export createAdapter() or ${adapterExportName}`
    )
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND' ||
      err?.code === 'MODULE_NOT_FOUND'
    ) {
      throw new Error(
        `Deploy provider '${packageName}' is not installed. Add ${packageName} to this project's dependencies.`
      )
    }
    throw e
  }
}

const ANSI = {
  green: '\x1b[32m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

async function writeResultFile(
  resultFile: string | undefined,
  result: Record<string, unknown>
): Promise<void> {
  if (resultFile) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8')
  }
}

async function runDeploy(
  provider: ProviderAdapter,
  providerDir: string,
  logger: Logger,
  resultFile?: string
): Promise<void> {
  if (typeof provider.deploy !== 'function') {
    logger.error(`Provider '${provider.name}' does not support deploy.`)
    await writeResultFile(resultFile, {
      success: false,
      errors: [{ step: 'provider', error: 'No deploy support' }],
    })
    process.exit(1)
  }

  logger.info(`Deploying via ${provider.name}...`)

  let deployResult: {
    success: boolean
    workersDeployed?: unknown[]
    resourcesCreated?: unknown[]
    errors: Array<{ step: string; error: string }>
  }

  try {
    deployResult = await provider.deploy({
      buildDir: providerDir,
      logger,
      onProgress: (step: string, detail: string) => {
        logger.info({
          message: `[${step}] ${detail}`,
          type: 'progress',
          data: { progress: { step, detail } },
        })
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    deployResult = {
      success: false,
      errors: [{ step: 'deploy', error: message }],
    }
  }

  await writeResultFile(resultFile, deployResult)

  if (deployResult.success) {
    logger.info(`${ANSI.green}${ANSI.bold}Deployment complete.${ANSI.reset}`)
    logger.info(
      `  ${deployResult.workersDeployed?.length ?? 0} units deployed, ${deployResult.resourcesCreated?.length ?? 0} resources created`
    )
  } else {
    logger.error(
      `Deployment finished with ${deployResult.errors.length} error(s):`
    )
    for (const e of deployResult.errors) {
      logger.error(`  ${e.step}: ${e.error}`)
    }
  }
}

export const deployApply = pikkuSessionlessFunc<
  {
    fromPlan?: boolean
    provider?: string
    runtime?: string
    desktop?: boolean
    desktopUrl?: string
    resultFile?: string
    debugArtifacts?: boolean
  },
  void
>({
  func: async ({ logger, config, getInspectorState, bundler }, data) => {
    const projectDir = config.rootDir
    // A url on its own is a request for a shell — asking for both flags would
    // only leave `--desktop-url` alone as a silent no-op.
    const desktopUrl = data?.desktopUrl ?? config.deploy?.desktop?.url
    const provider = await resolveProvider(config, data?.provider, {
      runtime: data?.runtime,
      desktop: data?.desktop || Boolean(desktopUrl),
      projectDir,
      desktopIdentifier: config.deploy?.desktop?.identifier,
      desktopUrl,
    })
    const fromPlan = data?.fromPlan ?? false
    const resultFile = data?.resultFile

    if (fromPlan) {
      // Skip build pipeline — deploy from existing plan output
      const { join } = await import('node:path')
      const { existsSync } = await import('node:fs')

      const providerDir = join(projectDir, '.deploy', provider.deployDirName)
      const infraPath = join(providerDir, 'infra.json')

      if (!existsSync(infraPath)) {
        logger.error(
          `No plan found at ${providerDir}. Run 'pikku deploy plan' first.`
        )
        await writeResultFile(resultFile, {
          success: false,
          errors: [{ step: 'plan', error: 'No plan found' }],
        })
        process.exit(1)
      }

      await runDeploy(provider, providerDir, logger, resultFile)
      return
    }

    // Full build + deploy pipeline
    const inspectorState = await getInspectorState(true)
    const projectId = await resolveProjectId(projectDir)

    const buildResult = await runBuildPipeline({
      projectDir,
      projectId,
      provider,
      inspectorState,
      serverlessIncompatible: config.deploy?.serverlessIncompatible,
      defaultTarget: config.deploy?.defaultTarget,
      grouping: config.deploy?.grouping,
      globalHTTPPrefix: config.globalHTTPPrefix,
      getEntryContext,
      frontend: config.frontend,
      outDir: config.outDir,
      srcDirectories: config.srcDirectories,
      debugArtifacts: data?.debugArtifacts ?? false,
      logger,
      bundler,
    })

    if (buildResult.manifest.units.length === 0) {
      logger.info('No deployment units found. Nothing to deploy.')
      await writeResultFile(resultFile, {
        success: true,
        workersDeployed: [],
        resourcesCreated: [],
        errors: [],
      })
      return
    }

    const buildFailure = describeBuildFailure(buildResult)
    if (buildFailure) {
      await writeResultFile(resultFile, {
        success: false,
        errors: buildResult.bundleErrors.map((e) => ({
          step: 'bundle',
          error: `${e.unitName}: ${e.error}`,
        })),
        codegenErrors: buildResult.codegenErrors,
      })
      throw new PikkuDeployBuildFailedError(buildFailure)
    }

    const { providerDir, bundled } = buildResult

    if (typeof provider.deploy === 'function') {
      await runDeploy(provider, providerDir, logger, resultFile)
    } else {
      logger.info(`${ANSI.green}${ANSI.bold}Build complete.${ANSI.reset}`)
      logger.info(
        `  ${bundled.length} functions bundled to ${ANSI.bold}${providerDir}${ANSI.reset}`
      )
      await writeResultFile(resultFile, {
        success: true,
        buildOnly: true,
        unitCount: bundled.length,
      })
    }
  },
})
