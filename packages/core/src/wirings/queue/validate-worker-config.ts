import type {
  PikkuWorkerConfig,
  ConfigValidationResult,
} from './queue.types.js'

export interface QueueConfigMapping {
  supported: Partial<
    Record<
      keyof PikkuWorkerConfig,
      {
        queueProperty?: string
        transform?: (value: any) => any
        description: string
      }
    >
  >

  /** Rejected: the value is dropped and a warning raised. */
  unsupported: Partial<
    Record<
      keyof PikkuWorkerConfig,
      {
        reason: string
        explanation: string
      }
    >
  >

  /** Applied anyway, but with a warning describing the substituted behaviour. */
  fallbacks: Partial<
    Record<
      keyof PikkuWorkerConfig,
      {
        reason: string
        explanation: string
        fallbackValue: string
      }
    >
  >
}

export function validateWorkerConfig(
  configMapping: QueueConfigMapping,
  config: PikkuWorkerConfig = {}
): ConfigValidationResult {
  const applied: Partial<PikkuWorkerConfig> = {}
  const ignored: Partial<PikkuWorkerConfig> = {}
  const warnings: string[] = []
  const fallbacks: { [key: string]: any } = {}

  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue

    const configKey = key as keyof PikkuWorkerConfig

    if (configKey in configMapping.supported) {
      applied[configKey] = value
      continue
    }

    if (configKey in configMapping.fallbacks) {
      const fallbackMapping = configMapping.fallbacks[configKey]!
      applied[configKey] = value
      fallbacks[key] = fallbackMapping.fallbackValue
      warnings.push(
        `${key}: ${fallbackMapping.reason}. ${fallbackMapping.explanation}`
      )
      continue
    }

    if (configKey in configMapping.unsupported) {
      ignored[configKey] = value
      const mapping = configMapping.unsupported[configKey]!
      warnings.push(`${key}: ${mapping.reason}. ${mapping.explanation}`)
      continue
    }

    ignored[configKey] = value
    warnings.push(
      `${key}: Unknown configuration option for this queue implementation`
    )
  }

  return {
    applied,
    ignored,
    warnings,
    fallbacks,
  }
}
