import type {
  PikkuWorkerConfig,
  ConfigValidationResult,
} from './queue.types.js'

/**
 * Configuration mapping structure for queue implementations
 */
export interface QueueConfigMapping {
  /** Configurations that are directly supported */
  supported: Partial<
    Record<
      keyof PikkuWorkerConfig,
      {
        /** The property name in the underlying queue system */
        queueProperty?: string
        /** Optional transform function for the value */
        transform?: (value: any) => any
        /** Description of what this configuration does */
        description: string
      }
    >
  >

  /** Configurations that are not supported */
  unsupported: Partial<
    Record<
      keyof PikkuWorkerConfig,
      {
        /** Why this configuration is not supported */
        reason: string
        /** Detailed explanation of what the queue system does instead */
        explanation: string
      }
    >
  >

  /** Configurations that have partial support or workarounds */
  fallbacks: Partial<
    Record<
      keyof PikkuWorkerConfig,
      {
        /** Why this configuration uses a fallback */
        reason: string
        /** Detailed explanation of the fallback behavior */
        explanation: string
        /** The fallback value or description */
        fallbackValue: string
      }
    >
  >
}

/**
 * Validates worker configuration using a mapping table
 * This provides a flexible, maintainable way to validate configurations
 * across different queue implementations
 *
 * @param config - The worker configuration to validate
 * @param configMapping - The mapping table defining supported/unsupported configurations
 * @returns Validation result with applied, ignored, warnings, and fallbacks
 */
export function validateWorkerConfig(
  configMapping: QueueConfigMapping,
  config: PikkuWorkerConfig = {}
): ConfigValidationResult {
  const applied: Partial<PikkuWorkerConfig> = {}
  const ignored: Partial<PikkuWorkerConfig> = {}
  const warnings: string[] = []
  const fallbacks: { [key: string]: any } = {}

  // Process each configuration property
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue

    const configKey = key as keyof PikkuWorkerConfig

    // Check if it's a supported configuration
    if (configKey in configMapping.supported) {
      applied[configKey] = value
      continue
    }

    // Check if it's a fallback configuration
    if (configKey in configMapping.fallbacks) {
      const fallbackMapping = configMapping.fallbacks[configKey]!
      applied[configKey] = value
      fallbacks[key] = fallbackMapping.fallbackValue
      warnings.push(
        `${key}: ${fallbackMapping.reason}. ${fallbackMapping.explanation}`
      )
      continue
    }

    // Check if it's an unsupported configuration
    if (configKey in configMapping.unsupported) {
      ignored[configKey] = value
      const mapping = configMapping.unsupported[configKey]!
      warnings.push(`${key}: ${mapping.reason}. ${mapping.explanation}`)
      continue
    }

    // Unknown configuration
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
