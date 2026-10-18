import { fileURLToPath } from 'node:url'
import type {
  InspectorOptions,
  SerializableInspectorState,
} from '@pikku/inspector'

/**
 * The version of the stdin/stdout contract between this package and the
 * `pikku-inspect` binary. Bumped on any change a binary built against the
 * previous version could not honour.
 */
export const INSPECTOR_PROTOCOL_VERSION = 1

/**
 * The options the binary is given: what analysis reads, plus what the Go
 * finalize reads (`openAPI`, `manifest`, `modelAliases`, `strictMeta`).
 */
export type InspectorGoAnalysisOptions = Pick<
  InspectorOptions,
  | 'tsconfig'
  | 'rootDir'
  | 'setupOnly'
  | 'types'
  | 'isAddon'
  | 'tags'
  | 'classificationCheck'
  | 'allow'
  | 'openAPI'
  | 'manifest'
  | 'modelAliases'
  | 'strictMeta'
> & {
  schemaConfig?: NonNullable<InspectorOptions['schemaConfig']> & {
    /**
     * The Node script that turns into JSON Schema the Zod schemas the
     * binary's own QuickJS cannot: one built from a package import, or
     * declared in a module that only loads under Node.
     */
    vendorScript?: string
  }
}

/** The Node Zod converter this package ships, the binary's fallback. */
export const VENDOR_SCHEMA_SCRIPT = fileURLToPath(
  new URL('../scripts/vendor-schemas.mjs', import.meta.url)
)

/** What `pikku-inspect --stdin` reads. */
export interface InspectorGoInput {
  routeFiles: string[]
  options: InspectorGoAnalysisOptions
}

export type InspectorGoDiagnosticLevel =
  'critical' | 'error' | 'warn' | 'info' | 'debug'

/**
 * One message the binary would have sent to the inspector logger, replayed
 * in order. A `critical` carries the `ErrorCode` it was raised with.
 */
export interface InspectorGoDiagnostic {
  level: InspectorGoDiagnosticLevel
  code?: string
  message: string
}

export interface InspectorGoStats {
  /** Source files in the program, node_modules and lib included. */
  files: number
  /** Files under rootDir the inspector actually swept. */
  projectFiles: number
  types: number
  /** Type instantiations; the Go checker does not count them, so 0. */
  instantiations: number
  symbols: number
  /** Process CPU time (user + system), in milliseconds. */
  cpuMs: number
  wallMs: number
  heapUsedMb: number
}

/** What `pikku-inspect --stdin` writes. */
export interface InspectorGoOutput {
  protocol: typeof INSPECTOR_PROTOCOL_VERSION
  /** True: the binary always runs finalize. False only alongside `error`. */
  finalized: boolean
  /** Absent when `error` is set. */
  state?: SerializableInspectorState
  diagnostics: InspectorGoDiagnostic[]
  stats: InspectorGoStats
  /**
   * The diagnostics finalize logged inside its validation pass, as indices
   * `[start, end)` into `diagnostics`. The wrapper replays the bracket as
   * `logger.beginValidationPass()` / `endValidationPass()`. Absent when the
   * binary ran no validation pass.
   */
  validationPass?: InspectorGoValidationPass
  /**
   * Set when the inspection failed after it began logging (a schema that
   * could not be generated, a fatal analysis error). `diagnostics` still
   * holds what was logged; the wrapper replays it, then throws this.
   */
  error?: string
}

export interface InspectorGoValidationPass {
  start: number
  end: number
}

/** Projects `options` down to the fields analysis reads. */
export const toAnalysisOptions = (
  options: InspectorOptions
): InspectorGoAnalysisOptions => {
  const picked: InspectorGoAnalysisOptions = {
    tsconfig: options.tsconfig,
    rootDir: options.rootDir,
    setupOnly: options.setupOnly,
    types: options.types,
    schemaConfig: options.schemaConfig && {
      vendorScript: VENDOR_SCHEMA_SCRIPT,
      ...options.schemaConfig,
    },
    isAddon: options.isAddon,
    tags: options.tags,
    classificationCheck: options.classificationCheck,
    allow: options.allow,
    openAPI: options.openAPI,
    manifest: options.manifest,
    modelAliases: options.modelAliases,
    strictMeta: options.strictMeta,
  }
  return Object.fromEntries(
    Object.entries(picked).filter(
      ([, value]) => value !== undefined && value !== null
    )
  ) as InspectorGoAnalysisOptions
}
