/**
 * The wire shape of the public surface. It is declared here rather than
 * imported because the two halves are produced by packages the addon must not
 * depend on — the doc by `@pikku/cli` at its own build time, the usage by the
 * inspector at prebuild — and consumed by a console that ships separately. The
 * addon only relays them, so this file is the contract all three agree on.
 */
export type SurfaceKind =
  'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'namespace'

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
  summary?: string
  docs?: string
  deprecated?: string
}

export type SurfaceLeaf = {
  specifier: string
  name: string
  step: SurfaceStep
  summary: string
  symbols: SurfaceSymbol[]
}

export type SurfaceEntryPointId = 'app' | 'addon'

export type SurfaceEntryPoint = {
  id: SurfaceEntryPointId
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
  files: string[]
}

export type SurfaceUsage = {
  bySpecifier: Record<string, Record<string, SurfaceSymbolUsage>>
}

/** What the console page is given: the framework's doc and this project's usage. */
export type SurfaceResult = {
  doc: SurfaceDoc | null
  usage: SurfaceUsage
}
