export type SurfaceKind =
  'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'namespace'

/**
 * The order in which you meet these doors while building a service. It is the
 * page's spine: the navigator groups by it and the reading order follows it.
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

export type SurfaceSymbol = {
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
  symbols: SurfaceSymbol[]
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

export type SurfaceDoc = {
  version: string
  entryPoints: SurfaceEntryPoint[]
}

export type SurfaceSymbolUsage = {
  imports: number
  seenIn: string[]
}

/**
 * Measured usage, keyed by specifier and then by export name. The console has
 * it and the website does not — every affordance that reads it is optional, so
 * the same page teaches without it and confirms with it.
 */
export type SurfaceUsage = {
  bySpecifier: Record<string, Record<string, SurfaceSymbolUsage>>
}
