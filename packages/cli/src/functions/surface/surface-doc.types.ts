import type { SurfaceKind } from './collect-surface.js'

export type { SurfaceKind }

/**
 * The order in which you meet these doors while building a service. It is the
 * page's spine: the console groups by it and the reading order follows it.
 */
export type SurfaceStep =
  | 'create a function'
  | 'enhance it'
  | 'wire it up'
  | 'guard it'
  | 'orchestrate it'
  | 'test it'

export type SurfaceOrigin =
  | { via: 'generated' }
  | { via: 'core'; subpath: string }
  | { via: 'package'; packageName: string }

export type SurfaceDocSymbol = {
  name: string
  kind: SurfaceKind
  origin: SurfaceOrigin
  signature?: string
  summary?: string
  deprecated?: string
}

export type SurfaceLeaf = {
  /** The specifier you import from, e.g. `#pikku/http`. */
  specifier: string
  name: string
  step: SurfaceStep
  summary: string
  symbols: SurfaceDocSymbol[]
}

export type SurfaceEntryPointId = 'app' | 'addon' | 'ecosystem'

export type SurfaceEntryPoint = {
  id: SurfaceEntryPointId
  /** What someone reaching for this entry point is trying to do. */
  job: string
  specifierBase: string
  summary: string
  leaves: SurfaceLeaf[]
}

/**
 * Metadata about the framework itself rather than about any one project: which
 * leaves an application gets, which an addon gets, and what each one exports.
 * It is computed when `@pikku/cli` is built and published inside it, so a
 * consumer reads it at `@pikku/cli/surface.json` without generating anything.
 */
export type SurfaceDoc = {
  /** The `@pikku/cli` version this surface was computed from. */
  version: string
  entryPoints: SurfaceEntryPoint[]
}

export type SurfaceSymbolUsage = {
  imports: number
  seenIn: string[]
}

/**
 * Measured usage, keyed by specifier and then by export name. It is per-project
 * and written at prebuild time, so the console has it and the website does not
 * — every affordance that reads it is optional.
 */
export type SurfaceUsage = {
  bySpecifier: Record<string, Record<string, SurfaceSymbolUsage>>
}
