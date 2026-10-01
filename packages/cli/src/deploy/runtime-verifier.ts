/**
 * Runtime-tier verification of a deployment unit.
 *
 * Bundles the unit's entry with esbuild under the tier's profile and reads the
 * result: which packages put code in it, which Node built-ins it imports, and
 * which in-memory services it carries. The rules are in `@pikku/deploy`
 * (`analyzeUnit`); this file only produces the bundle they judge.
 *
 * It runs on its own bundle, before the real one, and applies none of the
 * adapter's aliases or built-in stubs. Those exist to make the real bundle
 * load, and they would also make a Node-only import look fine. Built-ins are
 * judged on the specifier as written; what the provider then stubs is reported
 * as a warning, not hidden.
 *
 * esbuild specifically, whichever runtime the CLI is under: another bundler
 * resolves different conditions and can reach a different answer.
 */

import { build, type Plugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  analyzeUnit,
  createPackageLookup,
  isNodeBuiltin,
  readRuntimeDeclaration,
  tierRank,
  type BuiltinImport,
  type MetafileLike,
  type RuntimeProfile,
  type RuntimeTier,
  type RuntimeWarning,
  type UnitAnalysis,
} from '@pikku/deploy'
import { formatViolations, formatWarnings } from '@pikku/deploy'
import type { DeploymentUnit, ProviderAdapter } from '@pikku/deploy'

/** esbuild resolve conditions every edge runtime shares. */
export const EDGE_CONDITIONS = ['workerd', 'worker', 'browser']

export interface VerifyUnitOptions {
  unit: Pick<DeploymentUnit, 'name'>
  entryPath: string
  projectDir: string
  profile: RuntimeProfile
  unitTier: RuntimeTier
  /** Gen files / modules this unit does not need (service requirements). */
  deadPatterns?: RegExp[]
  /** Regex sources of packages the provider never runs and stubs (`^pg$`). */
  providerStubs?: string[]
  /** `InMemory*` classes the app accepts on an edge unit. */
  allowInMemory?: string[]
}

export type VerifyResult =
  | { status: 'checked'; analysis: UnitAnalysis }
  | { status: 'skipped'; reason: string }

const toKey = (projectDir: string, file: string) =>
  relative(projectDir, file).split(sep).join('/')

/**
 * The tier a unit must fit: its own `runtime`, else the project's declaration,
 * else the provider's default. Never above what the provider offers.
 */
export function resolveTargetTier(
  unit: Pick<DeploymentUnit, 'runtime'>,
  projectDir: string,
  providerDefault: RuntimeTier
): RuntimeTier {
  let declared: RuntimeTier | undefined = unit.runtime
  if (!declared) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(projectDir, 'package.json'), 'utf-8')
      )
      declared = readRuntimeDeclaration(
        pkg,
        join(projectDir, 'package.json')
      )?.runtime
    } catch (error) {
      if ((error as Error).name === 'RuntimeDeclarationError') throw error
    }
  }
  if (!declared) return providerDefault
  return tierRank(declared) > tierRank(providerDefault)
    ? providerDefault
    : declared
}

export async function verifyUnitRuntime(
  options: VerifyUnitOptions
): Promise<VerifyResult> {
  const { projectDir, profile, deadPatterns = [] } = options
  const builtinImports: BuiltinImport[] = []
  const stubWarnings: RuntimeWarning[] = []
  const stubPatterns = (options.providerStubs ?? []).map((s) => new RegExp(s))

  const plugin: Plugin = {
    name: 'pikku-runtime-verify',
    setup(b) {
      // Judge a built-in on the specifier as written. This hook sees `fs` before
      // any alias turns it into `node:fs`.
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined
        if (isNodeBuiltin(args.path)) {
          builtinImports.push({
            specifier: args.path,
            importer: toKey(projectDir, args.importer),
          })
          return { path: args.path, external: true }
        }
        if (deadPatterns.some((p) => p.test(args.path))) {
          return { path: args.path, namespace: 'pikku-verify-stub' }
        }
        if (stubPatterns.some((p) => p.test(args.path))) {
          stubWarnings.push({
            kind: 'stubbed-module',
            specifier: args.path,
            importer: toKey(projectDir, args.importer),
          })
          return { path: args.path, namespace: 'pikku-verify-stub' }
        }
        return undefined
      })
      b.onLoad({ filter: /.*/, namespace: 'pikku-verify-stub' }, () => ({
        contents: 'module.exports = {}',
        loader: 'js',
      }))
    },
  }

  const nodePaths: string[] = []
  for (let dir = projectDir; ;) {
    nodePaths.push(join(dir, 'node_modules'))
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  let result
  try {
    result = await build({
      entryPoints: [options.entryPath],
      bundle: true,
      write: false,
      metafile: true,
      outfile: 'verify.js',
      absWorkingDir: projectDir,
      nodePaths,
      platform: 'neutral',
      format: 'esm',
      target: 'es2022',
      conditions: EDGE_CONDITIONS,
      mainFields: ['browser', 'module', 'main'],
      loader: { '.ts': 'ts' },
      logLevel: 'silent',
      // Provider scheme imports (`cloudflare:*`) are the runtime's own.
      external: profile.externals.filter(
        (e) => e !== 'node:*' && !e.startsWith('node:') && !isNodeBuiltin(e)
      ),
      plugins: [plugin],
    })
  } catch (error) {
    // An import that does not resolve is the real bundler's to report, with its
    // own context. Verifying a bundle that cannot be built would only repeat it.
    return {
      status: 'skipped',
      reason:
        error instanceof Error ? error.message.split('\n')[0]! : String(error),
    }
  }

  const analysis = analyzeUnit({
    unitName: options.unit.name,
    unitTier: options.unitTier,
    profile,
    metafile: result.metafile as unknown as MetafileLike,
    builtinImports,
    lookup: createPackageLookup(projectDir),
    entry: toKey(projectDir, options.entryPath),
    bundleText: result.outputFiles?.map((f) => f.text).join('\n'),
    allowInMemory: options.allowInMemory,
  })
  analysis.warnings.push(...stubWarnings)
  return { status: 'checked', analysis }
}

export interface VerifyUnitsResult {
  failures: Array<{ unitName: string; error: string }>
  warnings: string[]
}

/**
 * Verify every serverless unit against the provider's runtime profile. A no-op
 * for a provider that does not declare one. `server` units may use anything and
 * are not checked.
 */
export async function verifyUnitsRuntime(options: {
  provider: ProviderAdapter
  units: DeploymentUnit[]
  entryFiles: Map<string, string>
  projectDir: string
  deadPatternsFor?: (unit: DeploymentUnit) => Promise<RegExp[]>
}): Promise<VerifyUnitsResult> {
  const { provider } = options
  const out: VerifyUnitsResult = { failures: [], warnings: [] }
  if (!provider.getRuntimeProfile) return out
  const providerDefault = provider.getRuntimeProfile().tier

  for (const unit of options.units) {
    if (unit.target === 'server') continue
    const entryPath = options.entryFiles.get(unit.name)
    if (!entryPath) continue
    const unitTier = resolveTargetTier(
      unit,
      options.projectDir,
      providerDefault
    )
    if (unitTier === 'server') continue
    const result = await verifyUnitRuntime({
      unit,
      entryPath,
      projectDir: options.projectDir,
      profile: provider.getRuntimeProfile(unitTier),
      unitTier,
      deadPatterns: await options.deadPatternsFor?.(unit),
      providerStubs: provider.getStubModules?.(),
    })
    if (result.status === 'skipped') continue
    const warnings = formatWarnings(result.analysis)
    if (warnings) out.warnings.push(warnings)
    if (result.analysis.violations.length > 0) {
      out.failures.push({
        unitName: unit.name,
        error: formatViolations(result.analysis),
      })
    }
  }
  return out
}
