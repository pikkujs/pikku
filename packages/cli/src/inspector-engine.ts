import {
  INSPECTOR_ENGINES,
  isInspectorEngine,
  setInspectorEngine,
  type InspectorEngine,
} from '@pikku/inspector-go'

/** The engine used when neither `--inspector`, `PIKKU_INSPECTOR` nor the config key names one. */
export const DEFAULT_ENGINE: InspectorEngine = 'rs'

export type InspectorEngineSelection = {
  /** `--inspector`, which beats `PIKKU_INSPECTOR`. */
  flag?: unknown
  /** The `inspector` key of pikku.config.json, which `PIKKU_INSPECTOR` beats. */
  config?: unknown
  env?: NodeJS.ProcessEnv
}

const named = (value: unknown): value is string =>
  value !== undefined && value !== ''

const parse = (source: string, value: unknown): InspectorEngine => {
  if (!isInspectorEngine(value)) {
    throw new Error(
      `${source} is ${JSON.stringify(value)}; expected one of ${INSPECTOR_ENGINES.join(', ')}.`
    )
  }
  return value
}

/**
 * Picks the inspector engine: `--inspector`, then `PIKKU_INSPECTOR`, then the
 * `inspector` key of pikku.config.json, then DEFAULT_ENGINE.
 */
export const resolveInspectorEngine = ({
  flag,
  config,
  env = process.env,
}: InspectorEngineSelection = {}): InspectorEngine => {
  if (named(flag)) return parse('--inspector', flag)
  if (named(env.PIKKU_INSPECTOR)) {
    return parse('PIKKU_INSPECTOR', env.PIKKU_INSPECTOR)
  }
  if (named(config)) return parse('"inspector" in pikku.config.json', config)
  return DEFAULT_ENGINE
}

/** Resolves the engine and tells the inspector package to use it. */
export const selectInspectorEngine = (
  selection: InspectorEngineSelection
): InspectorEngine => {
  const engine = resolveInspectorEngine(selection)
  // Exported so codegen child processes resolve the same engine.
  if (named(selection.flag)) process.env.PIKKU_INSPECTOR = engine
  setInspectorEngine(engine)
  return engine
}
