import { findInspectorBinary } from '@pikku/inspector-go'
import { z } from 'zod'

/**
 * Which inspector analyses the project:
 *
 * - `native` — the `pikku-inspect` binary from `@pikku/inspector-go`, built on
 *   typescript-go (TypeScript 7). The default.
 * - `typescript` — `@pikku/inspector`, on the TypeScript 6 compiler API.
 *
 * Both produce byte-identical output.
 */
export const InspectorEngineSchema = z.enum(['native', 'typescript'])

export type InspectorEngine = z.infer<typeof InspectorEngineSchema>

export const DEFAULT_INSPECTOR_ENGINE: InspectorEngine = 'native'

export interface InspectorEngineSources {
  /** `--inspector` */
  flag?: string
  /** `PIKKU_INSPECTOR` */
  env?: string
  /** `inspector` in pikku.config.json */
  config?: string
  /**
   * Whether a `pikku-inspect` binary exists for this platform. Consulted only
   * when no source is set: the default falls back to `typescript` without
   * one, while an explicit `native` fails at inspection with an error that
   * names the TypeScript engine.
   */
  nativeAvailable?: () => boolean
  /** Told when the default falls back to `typescript`. */
  onFallback?: () => void
}

/**
 * Resolves the engine with precedence flag > env > config > default
 * (`native`, or `typescript` when no binary exists for the platform). The first source that is set is validated against
 * `InspectorEngineSchema`; an invalid value is an error rather than being
 * skipped in favour of the next source.
 */
export const resolveInspectorEngine = ({
  flag,
  env,
  config,
  nativeAvailable,
  onFallback,
}: InspectorEngineSources = {}): InspectorEngine => {
  const [source, value] = flag
    ? ['--inspector', flag]
    : env
      ? ['PIKKU_INSPECTOR', env]
      : config
        ? ["pikku.config.json's `inspector`", config]
        : [undefined, undefined]
  if (value === undefined) {
    if (
      DEFAULT_INSPECTOR_ENGINE === 'native' &&
      nativeAvailable?.() === false
    ) {
      onFallback?.()
      return 'typescript'
    }
    return DEFAULT_INSPECTOR_ENGINE
  }
  const result = InspectorEngineSchema.safeParse(value)
  if (!result.success) {
    throw new Error(
      `${source} must be one of ${InspectorEngineSchema.options.map((o) => `'${o}'`).join(', ')}, not '${value}'`
    )
  }
  return result.data
}

let selected: InspectorEngine | undefined

/**
 * Records the engine this CLI process resolved from its flags and config, so
 * the source helpers outside an inspection (`inspector-helpers.ts`) and any
 * codegen child process use the same one.
 */
export const setInspectorEngine = (engine: InspectorEngine): void => {
  selected = engine
}

/** Whether a `pikku-inspect` binary exists for this platform. */
export const nativeInspectorAvailable = (): boolean => {
  try {
    findInspectorBinary()
    return true
  } catch {
    return false
  }
}

/**
 * The engine this process uses. Before the CLI has resolved its config (a
 * build script calling a helper directly), it resolves from the environment
 * alone, falling back to `typescript` like the CLI does when no binary exists.
 */
export const getInspectorEngine = (): InspectorEngine =>
  (selected ??= resolveInspectorEngine({
    env: process.env.PIKKU_INSPECTOR,
    nativeAvailable: nativeInspectorAvailable,
  }))
