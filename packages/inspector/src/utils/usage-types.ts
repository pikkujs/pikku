export type SecretUsage = {
  /** Secret ids read with a string literal, so statically known. */
  keys: string[]
  /** Reads whose key could not be resolved statically, as `line:source`. */
  dynamic: string[]
}

/**
 * How often each `#pikku/*` export is imported, the source areas it was
 * imported from, and the files those imports are written in. Counters only:
 * this is accumulated during the sweep that already visits every source file,
 * so nothing here may retain a node.
 */
export type SurfaceUsageCounts = Record<
  string,
  Record<string, { imports: number; seenIn: string[]; files: string[] }>
>

/**
 * Where a source file reaches around a Pikku service. Each entry is
 * `line:snippet`, in source order and without repeats.
 *
 * The two lists are the evidence for two lint policies (not for two
 * detections): `lint.enforceContentService` and `lint.enforceVariablesService`.
 */
export type ServiceBypassUsage = {
  /** Direct file storage access, bypassing the `content` service. */
  content: string[]
  /** Direct `process.env` reads, bypassing `variables` / `secrets`. */
  variables: string[]
}
