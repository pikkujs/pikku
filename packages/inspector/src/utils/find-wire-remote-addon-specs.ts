/** A `wireRemoteAddon({ package })` found in source, with the line its literal sits on. */
export type WireRemoteAddonSpec = {
  /** The `name` option, when it is a literal. */
  namespace?: string
  /** The literal as written, e.g. `@scope/name@^1.4.0`. */
  spec: string
  name: string
  range?: string
  /** 1-based line of the literal. */
  line: number
}
