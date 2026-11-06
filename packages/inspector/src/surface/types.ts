export type SurfaceKind =
  'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'namespace'

export type SurfaceSymbol = {
  name: string
  kind: SurfaceKind
  declaredAt: string
  /** Absolute path of the declaring file, or null when it could not be found. */
  declaredIn: string | null
  deprecated: boolean
  /** The text of the `@deprecated` tag, when it carries one. */
  deprecatedReason?: string
  /** First paragraph of the symbol's JSDoc. */
  summary?: string
  /** The symbol's JSDoc in full, paragraphs and examples included. */
  docs?: string
  /** The type as the checker prints it, so a caller knows how to call it. */
  signature?: string
  /**
   * The shape written at the call site, one `name?: type` per entry — the
   * properties of the object a function takes, or of the type itself. The
   * signature names that shape; this says what is in it.
   */
  members?: SurfaceMember[]
  /** The `@example` blocks, which the documentation comment leaves out. */
  examples?: string[]
  /** The HTTP status an error class is registered with. */
  status?: number
}

export type SurfaceEntrypoint = {
  subpath: string
  specifier: string
  entryFile: string
  symbols: SurfaceSymbol[]
}

/**
 * One key of an options object: how it is written, and — where the declaring
 * type says so — what it means. `schedule: string` is a shape; "a cron
 * expression" is what a caller actually needs, and only the JSDoc has it.
 */
export type SurfaceMember = {
  line: string
  doc?: string
}
