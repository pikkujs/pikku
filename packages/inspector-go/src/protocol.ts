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
 * The options analysis reads, which is all the binary is given. Everything
 * else in `InspectorOptions` is consumed by the TypeScript finalize that runs
 * on this side of the pipe.
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
> & {
  schemaConfig?: NonNullable<InspectorOptions['schemaConfig']> & {
    /**
     * The Node script that turns Zod schemas into JSON Schema. Zod schemas
     * are runtime values, so the binary cannot read them itself.
     */
    vendorScript?: string
  }
}

/** The Zod converter this package ships, run by the binary through Node. */
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
  symbols: number
  wallMs: number
  heapUsedMb: number
}

/** What `pikku-inspect --stdin` writes. */
export interface InspectorGoOutput {
  protocol: typeof INSPECTOR_PROTOCOL_VERSION
  /**
   * True when the binary already ran finalize, so the wrapper must not run
   * the TypeScript one again. False while finalize is still TypeScript-only.
   */
  finalized: boolean
  state: SerializableInspectorState
  diagnostics: InspectorGoDiagnostic[]
  stats: InspectorGoStats
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
  }
  return Object.fromEntries(
    Object.entries(picked).filter(([, value]) => value !== undefined)
  ) as InspectorGoAnalysisOptions
}
