import { pikkuSessionlessFunc } from '#pikku'

const KNOWN_MIDDLEWARE = new Set(['voiceInput', 'voiceOutput'])
const VALID_TOOL_CHOICES = new Set(['auto', 'required', 'none'])

export const validateAgentConfig = pikkuSessionlessFunc<
  {
    config: {
      instructions: string
      description: string
      model: string
      tools: string[]
      maxSteps: number
      temperature?: number
      toolChoice: string
      aiMiddleware?: string[]
      tags?: string[]
    }
    availableToolNames: string[]
  },
  { valid: boolean; errors: string[] }
>({
  expose: true,
  description: 'Validates an agent configuration for structural correctness',
  func: async ({}, { config, availableToolNames }) => {
    const errors: string[] = []
    const toolSet = new Set(availableToolNames)

    if (!config.instructions || config.instructions.length < 20) {
      errors.push(
        `'instructions' must be at least 20 characters long. Provide detailed guidance for the agent.`
      )
    }

    if (!config.description) {
      errors.push(`'description' must be a non-empty string.`)
    }

    if (!config.model || !config.model.includes('/')) {
      errors.push(
        `'model' must be in "provider/name" format (e.g. "openai/o4-mini"). Got: "${config.model || ''}".`
      )
    }

    for (const tool of config.tools) {
      if (!toolSet.has(tool)) {
        errors.push(
          `Tool '${tool}' does not exist. Available tools: ${availableToolNames.join(', ')}.`
        )
      }
    }

    if (
      typeof config.maxSteps !== 'number' ||
      config.maxSteps < 1 ||
      config.maxSteps > 100
    ) {
      errors.push(
        `'maxSteps' must be a number between 1 and 100. Got: ${config.maxSteps}.`
      )
    }

    if (config.temperature !== undefined) {
      if (
        typeof config.temperature !== 'number' ||
        config.temperature < 0 ||
        config.temperature > 2
      ) {
        errors.push(
          `'temperature' must be a number between 0 and 2. Got: ${config.temperature}.`
        )
      }
    }

    if (!VALID_TOOL_CHOICES.has(config.toolChoice)) {
      errors.push(
        `'toolChoice' must be one of 'auto', 'required', or 'none'. Got: "${config.toolChoice}".`
      )
    }

    if (config.tools.length > 20) {
      errors.push(
        `Too many tools (${config.tools.length}). Maximum is 20. Remove less relevant tools.`
      )
    }

    if (config.aiMiddleware) {
      for (const mw of config.aiMiddleware) {
        if (!KNOWN_MIDDLEWARE.has(mw)) {
          errors.push(
            `Unknown AI middleware '${mw}'. Known middleware: ${[...KNOWN_MIDDLEWARE].join(', ')}.`
          )
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },
})
