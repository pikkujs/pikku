import {
  configureInspectorEngine,
  isInspectorEngine,
  INSPECTOR_ENGINES,
} from '@pikku/inspector-go'

export type InspectorEngineSelection = {
  /** `--inspector`, which beats `PIKKU_INSPECTOR`. */
  flag?: unknown
  /** The `inspector` key of pikku.config.json, which `PIKKU_INSPECTOR` beats. */
  config?: unknown
}

const refuse = (source: string, value: unknown): never => {
  throw new Error(
    `${source} is ${JSON.stringify(value)}; expected one of ${INSPECTOR_ENGINES.join(', ')}.`
  )
}

/**
 * Applies the `inspector` choice: `--inspector` (exported as PIKKU_INSPECTOR so
 * codegen children and the helper calls see it), then `PIKKU_INSPECTOR`, then
 * the config key, then the package default.
 */
export const selectInspectorEngine = ({
  flag,
  config,
}: InspectorEngineSelection): void => {
  if (flag !== undefined && flag !== '') {
    if (!isInspectorEngine(flag)) refuse('--inspector', flag)
    process.env.PIKKU_INSPECTOR = flag as string
  }
  if (config !== undefined && config !== '') {
    if (!isInspectorEngine(config)) refuse('"inspector" in pikku.config.json', config)
    configureInspectorEngine(config as string)
  } else {
    configureInspectorEngine(undefined)
  }
}
