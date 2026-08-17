import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { collectSurface, type SurfaceEntrypoint } from './collect-surface.js'
import {
  ENTRY_POINT_EDITORIAL,
  LEAF_EDITORIAL,
  type LeafEditorial,
} from './surface-editorial.js'
import type {
  SurfaceDoc,
  SurfaceDocSymbol,
  SurfaceEntryPoint,
  SurfaceEntryPointId,
  SurfaceLeaf,
  SurfaceOrigin,
  SurfaceStep,
} from './surface-doc.types.js'

/** The specifier an application reaches its generated leaves through. */
export const PIKKU_IMPORTS_SUBPATH = '#pikku/*'

const CORE_PACKAGE_NAME = '@pikku/core'

const STEP_ORDER: SurfaceStep[] = [
  'create a function',
  'enhance it',
  'wire it up',
  'guard it',
  'orchestrate it',
  'test it',
]

export class MissingSurfaceEditorialError extends Error {
  constructor(entryPoint: SurfaceEntryPointId, leaves: string[]) {
    super(
      `The ${entryPoint} surface has ${leaves.length} leaf${
        leaves.length === 1 ? '' : 'es'
      } with no editorial entry: ${leaves.join(', ')}. Add ${
        leaves.length === 1 ? 'it' : 'them'
      } to LEAF_EDITORIAL in src/functions/surface/surface-editorial.ts.`
    )
    this.name = 'MissingSurfaceEditorialError'
  }
}

type PackageJson = { name?: string; exports?: Record<string, unknown> }

const readPackageJson = (path: string): PackageJson | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

const nearestPackage = (
  file: string
): { dir: string; packageJson: PackageJson } | null => {
  let directory = dirname(file)
  for (;;) {
    const candidate = join(directory, 'package.json')
    if (existsSync(candidate)) {
      const packageJson = readPackageJson(candidate)
      if (packageJson?.name) return { dir: directory, packageJson }
    }
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

const isInside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child)
  return rel.length > 0 && !rel.startsWith('..') && !rel.startsWith(sep)
}

/**
 * Which `@pikku/core` subpath a declaration sits behind. The declaring file is
 * usually deeper than the entry the leaf re-exported — `wireHTTP` is declared in
 * `src/wirings/http/http-runner.ts`, not in the `./http` entry — so the longest
 * declared subpath that prefixes the path wins, and the package root is the
 * answer when none does.
 */
const coreSubpathOf = (
  packageDir: string,
  packageJson: PackageJson,
  file: string
): string => {
  const declared = new Set(
    Object.keys(packageJson.exports ?? {}).filter(
      (key) => key.startsWith('./') && !key.includes('*')
    )
  )
  const segments = relative(packageDir, file)
    .split(sep)
    .filter((segment) => segment !== 'src' && segment !== 'dist')
  // Wirings live one directory down from the subpath that publishes them.
  const meaningful = segments[0] === 'wirings' ? segments.slice(1) : segments
  for (let length = Math.min(meaningful.length, 2); length > 0; length--) {
    const candidate = `./${meaningful.slice(0, length).join('/')}`
    if (declared.has(candidate)) return candidate
  }
  return '.'
}

const originOf = (
  declaredIn: string | null,
  generatedRoot: string | null
): SurfaceOrigin => {
  if (!declaredIn) return { via: 'generated' }
  if (generatedRoot && isInside(generatedRoot, declaredIn)) {
    return { via: 'generated' }
  }
  const owner = nearestPackage(declaredIn)
  if (!owner) return { via: 'generated' }
  const packageName = owner.packageJson.name!
  if (packageName === CORE_PACKAGE_NAME) {
    return {
      via: 'core',
      subpath: coreSubpathOf(owner.dir, owner.packageJson, declaredIn),
    }
  }
  return { via: 'package', packageName }
}

const toDocSymbols = (
  entrypoint: SurfaceEntrypoint,
  generatedRoot: string | null
): SurfaceDocSymbol[] =>
  [...entrypoint.symbols]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      origin: originOf(symbol.declaredIn, generatedRoot),
      ...(symbol.summary ? { summary: symbol.summary } : {}),
      ...(symbol.docs ? { docs: symbol.docs } : {}),
      ...(symbol.deprecated
        ? { deprecated: symbol.deprecatedReason ?? 'Deprecated' }
        : {}),
    }))

const byStepThenName = (a: SurfaceLeaf, b: SurfaceLeaf): number =>
  STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step) ||
  a.name.localeCompare(b.name)

const leafNameOf = (subpath: string): string =>
  subpath.replace(/^#pikku\//, '').replace(/^\.\//, '')

const toLeaves = (
  entryPoint: SurfaceEntryPointId,
  entrypoints: SurfaceEntrypoint[],
  editorial: (name: string) => LeafEditorial | undefined,
  generatedRoot: string | null
): SurfaceLeaf[] => {
  const leaves: SurfaceLeaf[] = []
  const missing: string[] = []

  for (const entrypoint of entrypoints) {
    const name = leafNameOf(entrypoint.subpath)
    const copy = editorial(entrypoint.subpath)
    if (!copy) {
      missing.push(name)
      continue
    }
    leaves.push({
      specifier: entrypoint.specifier,
      name,
      step: copy.step,
      summary: copy.summary,
      symbols: toDocSymbols(entrypoint, generatedRoot),
    })
  }

  if (missing.length > 0) {
    throw new MissingSurfaceEditorialError(entryPoint, missing.sort())
  }

  return leaves.sort(byStepThenName)
}

/**
 * A generated project — an application or an addon — whose `.pikku` tree has
 * been written and whose package.json maps `#pikku/*` onto it.
 */
export type SurfaceProject = {
  projectDir: string
  /** The generated tree, so a symbol declared inside it reads as `generated`. */
  outDir?: string
}

export type BuildSurfaceDocOptions = {
  /** The `@pikku/cli` version the doc describes. */
  version: string
  app: SurfaceProject
  addon: SurfaceProject
}

const projectEntryPoint = async (
  id: 'app' | 'addon',
  project: SurfaceProject
): Promise<SurfaceEntryPoint> => {
  const projectDir = resolve(project.projectDir)
  const generatedRoot = resolve(project.outDir ?? join(projectDir, '.pikku'))
  const entrypoints = await collectSurface(projectDir, {
    importsSubpath: PIKKU_IMPORTS_SUBPATH,
  })
  return {
    id,
    ...ENTRY_POINT_EDITORIAL[id],
    specifierBase: '#pikku',
    leaves: toLeaves(
      id,
      entrypoints,
      (subpath) => LEAF_EDITORIAL[leafNameOf(subpath)],
      generatedRoot
    ),
  }
}

export const buildSurfaceDoc = async ({
  version,
  app,
  addon,
}: BuildSurfaceDocOptions): Promise<SurfaceDoc> => ({
  version,
  entryPoints: [
    await projectEntryPoint('app', app),
    await projectEntryPoint('addon', addon),
  ],
})
