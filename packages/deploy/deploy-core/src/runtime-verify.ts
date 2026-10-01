/**
 * The runtime-tier check, on a bundle's metafile.
 *
 * Pure analysis: the bundling (esbuild, per-tier profile, run before any
 * adapter alias or stub) lives with the bundler in the CLI and hands its output
 * here. Keeping the rules out of the bundler is what lets them be tested
 * without one.
 */

import {
  isBuiltinAllowed,
  isBuiltinStubbed,
  type RuntimeProfile,
} from './runtime-profile.js'
import {
  tierFitsWithin,
  type PackageTier,
  type RuntimeTier,
} from './runtime-tier.js'

export interface MetafileLike {
  inputs: Record<
    string,
    {
      bytes?: number
      imports: Array<{ path: string; kind?: string; external?: boolean }>
    }
  >
  outputs: Record<
    string,
    {
      entryPoint?: string
      imports?: Array<{ path: string; kind?: string; external?: boolean }>
      inputs: Record<string, { bytesInOutput: number }>
    }
  >
}

/** A Node built-in the bundler saw imported, and from where. */
export interface BuiltinImport {
  /** The specifier as written: `fs`, `node:os`. */
  specifier: string
  /** The metafile input key of the importing file. */
  importer: string
}

export interface OwningPackage {
  name: string
  tier: PackageTier
  /** The `package.json` that decided the tier, for the message. */
  declaredIn?: string
}

export type PackageLookup = (inputPath: string) => OwningPackage | undefined

export type RuntimeViolation =
  | {
      kind: 'package-tier'
      packageName: string
      packageTier: RuntimeTier
      declaredIn?: string
      subpath?: string
      file: string
      chain: string[]
    }
  | {
      kind: 'builtin'
      specifier: string
      importer: string
      packageName?: string
      chain: string[]
    }
  | {
      kind: 'in-memory'
      className: string
    }

export interface RuntimeWarning {
  /**
   * `stubbed-builtin`: the provider swaps a built-in for an empty module.
   * `stubbed-module`: the provider swaps a package it never runs for one.
   */
  kind: 'stubbed-builtin' | 'stubbed-module'
  specifier: string
  importer: string
  packageName?: string
}

export interface AnalyzeUnitInput {
  unitName: string
  /** The tier the unit has to run at. */
  unitTier: RuntimeTier
  profile: Pick<RuntimeProfile, 'allowedBuiltins' | 'stubbedBuiltins'>
  metafile: MetafileLike
  builtinImports: BuiltinImport[]
  lookup: PackageLookup
  /** The generated entry's input key. Defaults to the first output's entry point. */
  entry?: string
  /** The bundle's JavaScript, for in-memory class detection (edge only). */
  bundleText?: string
  /** `InMemory*` classes the app has decided are acceptable. */
  allowInMemory?: string[]
}

export interface UnitAnalysis {
  unitName: string
  unitTier: RuntimeTier
  violations: RuntimeViolation[]
  warnings: RuntimeWarning[]
  /** Every package that put code in the bundle, with the tier it declares. */
  packages: Array<{ name: string; tier: RuntimeTier; declared: boolean }>
}

/** Class names of in-memory services present in a bundle's source text. */
export function findInMemoryClasses(bundleText: string): string[] {
  const found = new Set<string>()
  for (const match of bundleText.matchAll(
    /\b(?:class\s+|(?:var|let|const)\s+)(InMemory[A-Za-z0-9_$]*)(?=\s*(?:\{|extends\b|=\s*class\b))/g
  )) {
    // esbuild renames a collision to `Name2`; report the name the author wrote.
    found.add(match[1]!.replace(/\d+$/, ''))
  }
  return [...found].sort()
}

/** Shortest import chain from `from` to `to`, as input keys. */
export function importChain(
  metafile: MetafileLike,
  from: string | undefined,
  to: string
): string[] {
  if (!from || !(from in metafile.inputs)) return [to]
  if (from === to) return [from]
  const previous = new Map<string, string>([[from, '']])
  const queue = [from]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of metafile.inputs[current]?.imports ?? []) {
      if (edge.external || previous.has(edge.path)) continue
      previous.set(edge.path, current)
      if (edge.path === to) {
        const chain = [to]
        let at = to
        while (previous.get(at)) {
          at = previous.get(at)!
          chain.unshift(at)
        }
        return chain
      }
      queue.push(edge.path)
    }
  }
  return [to]
}

const isRealInput = (key: string) =>
  !key.includes(':') || /^[A-Za-z]:[\\/]/.test(key)

export function analyzeUnit(input: AnalyzeUnitInput): UnitAnalysis {
  const { metafile, lookup, unitTier, profile } = input
  const violations: RuntimeViolation[] = []
  const warnings: RuntimeWarning[] = []

  const entry =
    input.entry ??
    Object.values(metafile.outputs).find((o) => o.entryPoint)?.entryPoint

  // Modules that made it into the output, and their bytes.
  const bytes = new Map<string, number>()
  for (const output of Object.values(metafile.outputs)) {
    for (const [file, { bytesInOutput }] of Object.entries(output.inputs)) {
      bytes.set(file, (bytes.get(file) ?? 0) + bytesInOutput)
    }
  }
  const stillImported = new Set<string>()
  for (const output of Object.values(metafile.outputs)) {
    for (const imp of output.imports ?? []) stillImported.add(imp.path)
  }

  // Packages by the code they actually contribute.
  const packages = new Map<
    string,
    { name: string; tier: RuntimeTier; declared: boolean }
  >()
  const seenPackageViolations = new Set<string>()
  for (const [file, size] of bytes) {
    if (size === 0 || !isRealInput(file)) continue
    const owner = lookup(file)
    if (!owner) continue
    packages.set(owner.name, {
      name: owner.name,
      tier: owner.tier.tier,
      declared: owner.tier.declared,
    })
    if (!owner.tier.declared || tierFitsWithin(owner.tier.tier, unitTier))
      continue
    const key = `${owner.name}|${owner.tier.matchedSubpath ?? ''}`
    if (seenPackageViolations.has(key)) continue
    seenPackageViolations.add(key)
    violations.push({
      kind: 'package-tier',
      packageName: owner.name,
      packageTier: owner.tier.tier,
      declaredIn: owner.declaredIn,
      subpath: owner.tier.matchedSubpath,
      file,
      chain: importChain(metafile, entry, file),
    })
  }

  // Built-ins, judged on the specifier as written: before the adapter's
  // aliases rewrite `fs` to `node:fs` and before its stubs empty the module, so
  // neither can hide one.
  const seenBuiltins = new Set<string>()
  for (const hit of input.builtinImports) {
    const importerBytes = bytes.get(hit.importer)
    const survives =
      importerBytes === undefined ||
      importerBytes > 0 ||
      stillImported.has(hit.specifier)
    if (!survives) continue
    const key = `${hit.specifier}|${hit.importer}`
    if (seenBuiltins.has(key)) continue
    seenBuiltins.add(key)
    const owner = lookup(hit.importer)
    if (isBuiltinStubbed(profile, hit.specifier)) {
      warnings.push({
        kind: 'stubbed-builtin',
        specifier: hit.specifier,
        importer: hit.importer,
        packageName: owner?.name,
      })
      continue
    }
    if (unitTier === 'server' || isBuiltinAllowed(profile, hit.specifier))
      continue
    violations.push({
      kind: 'builtin',
      specifier: hit.specifier,
      importer: hit.importer,
      packageName: owner?.name,
      chain: importChain(metafile, entry, hit.importer),
    })
  }

  // Module-level in-memory state is per-isolate, so on an edge unit it is
  // silently wrong: two requests can land on two isolates that never see each
  // other's writes.
  if (unitTier === 'edge' && input.bundleText) {
    const allowed = new Set(input.allowInMemory ?? [])
    for (const className of findInMemoryClasses(input.bundleText)) {
      if (!allowed.has(className))
        violations.push({ kind: 'in-memory', className })
    }
  }

  return {
    unitName: input.unitName,
    unitTier,
    violations,
    warnings,
    packages: [...packages.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  }
}

const TIER_UP: Record<RuntimeTier, string> = {
  edge: 'edge',
  serverless: 'serverless',
  server: 'server',
}

const shorten = (path: string) => {
  const i = path.lastIndexOf('node_modules/')
  return i === -1 ? path : path.slice(i + 'node_modules/'.length)
}

const formatChain = (chain: string[]) => {
  const parts = chain.map(shorten)
  if (parts.length > 8) {
    return [...parts.slice(0, 3), '...', ...parts.slice(-4)].join(' -> ')
  }
  return parts.join(' -> ')
}

/**
 * The failure as text for people and for agents: a header line, then one block
 * per violation with `key=value` facts and a `fix:` line.
 */
export function formatViolations(analysis: UnitAnalysis): string {
  const { unitName, unitTier, violations } = analysis
  const lines = [
    `RUNTIME_TIER_VIOLATION unit=${unitName} unit-tier=${unitTier} violations=${violations.length}`,
  ]
  violations.forEach((v, i) => {
    const n = `[${i + 1}]`
    if (v.kind === 'package-tier') {
      lines.push(
        `${n} package=${v.packageName}${v.subpath ? ` subpath=${v.subpath}` : ''} package-tier=${v.packageTier} unit-tier=${unitTier}` +
          (v.declaredIn ? ` declared-in=${v.declaredIn}` : ''),
        `    import-chain: ${formatChain(v.chain)}`,
        `    fix: replace the import of "${v.packageName}" with an ${TIER_UP[unitTier]}-tier alternative, or move this unit to the ${v.packageTier} tier (unit "${unitName}" cannot run on ${unitTier} while it imports ${v.packageName}).`
      )
    } else if (v.kind === 'builtin') {
      lines.push(
        `${n} builtin=${v.specifier} unit-tier=${unitTier}` +
          (v.packageName ? ` package=${v.packageName}` : ''),
        `    imported-by: ${formatChain(v.chain.length ? v.chain : [v.importer])}`,
        unitTier === 'edge'
          ? `    fix: use a Web API instead of "${v.specifier}" (no node:* exists on the edge tier), or run this unit on the serverless tier.`
          : `    fix: "${v.specifier}" is not provided by this runtime at this compatibility date; replace the import, or move this unit to the server tier.`
      )
    } else {
      lines.push(
        `${n} in-memory-service=${v.className} unit-tier=${unitTier}`,
        `    fix: module-level in-memory state is per isolate and is lost or split across edge instances; wire a persistent ${v.className.replace(/^InMemory/, '')} implementation, or list "${v.className}" in the unit's allowInMemory if it is intentionally ephemeral.`
      )
    }
  })
  return lines.join('\n')
}

/** Warnings as text; empty when there are none. */
export function formatWarnings(analysis: UnitAnalysis): string {
  return analysis.warnings
    .map(
      (w) =>
        `RUNTIME_TIER_WARNING unit=${analysis.unitName} ${w.kind}=${w.specifier}` +
        (w.packageName ? ` package=${w.packageName}` : '') +
        ` importer=${shorten(w.importer)} (stubbed to an empty module by the provider; fails at runtime if actually called)`
    )
    .join('\n')
}
