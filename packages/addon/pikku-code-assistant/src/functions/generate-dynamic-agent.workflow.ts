import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
}

export const generateDynamicAgent = pikkuWorkflowComplexFunc<
  {
    prompt: string
    name?: string
    toolFilter?: string[]
    allowSubAgents?: boolean
  },
  {
    success: boolean
    agentName: string
    description: string
    filePath: string
    config: any
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  description: 'Generates an AI agent from a natural language prompt',
  expose: true,
  func: async ({}, data, { workflow }) => {
    const summarised = await workflow.do(
      'Summarise prompt',
      'aiSummarisePrompt',
      { prompt: data.prompt }
    )
    let totalInputTokens = summarised.inputTokens || 0
    let totalOutputTokens = summarised.outputTokens || 0
    let totalCostUsd = summarised.costUsd || 0

    const tools = await workflow.do('List tools', 'listAvailableTools', null)

    let selectedNames: string[]

    if (data.toolFilter && data.toolFilter.length > 0) {
      selectedNames = data.toolFilter
    } else {
      const selected = await workflow.do('Select tools', 'aiSelectTools', {
        prompt: data.prompt,
        functions: tools.summaries,
      })
      selectedNames = selected.names
      totalInputTokens += selected.inputTokens || 0
      totalOutputTokens += selected.outputTokens || 0
      totalCostUsd += selected.costUsd || 0
    }

    const middleware = await workflow.do(
      'List middleware',
      'listAvailableMiddleware',
      null
    )

    const schemas = await workflow.do('Get schemas', 'getToolSchemas', {
      names: selectedNames,
    })

    let lastError = ''

    for (let attempt = 0; attempt < 3; attempt++) {
      const design = await workflow.do(
        'Design agent',
        'aiDesignAgent',
        lastError
          ? {
              prompt: data.prompt,
              schemas: schemas.details,
              availableMiddleware: middleware.aiMiddleware,
              previousError: lastError,
            }
          : {
              prompt: data.prompt,
              schemas: schemas.details,
              availableMiddleware: middleware.aiMiddleware,
            }
      )
      totalInputTokens += design.inputTokens || 0
      totalOutputTokens += design.outputTokens || 0
      totalCostUsd += design.costUsd || 0

      if (design.config) {
        design.config.description = summarised.summary
      }

      const validation = await workflow.do(
        'Validate config',
        'validateAgentConfig',
        {
          config: design.config,
          availableToolNames: selectedNames,
        }
      )

      if (validation.valid) {
        let agentName = data.name
        if (!agentName) {
          const naming = await workflow.do('Name agent', 'aiNameAgent', {
            prompt: data.prompt,
          })
          agentName = naming.name
          totalInputTokens += naming.inputTokens || 0
          totalOutputTokens += naming.outputTokens || 0
          totalCostUsd += naming.costUsd || 0
        }

        const written = await workflow.do('Write file', 'writeAgentFile', {
          name: agentName,
          exportName: toCamelCase(agentName),
          config: design.config,
        })

        return {
          success: true,
          agentName: agentName!,
          description: summarised.summary,
          filePath: written.filePath,
          config: design.config,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
        }
      }

      lastError = validation.errors.join('\n')
    }

    return {
      success: false,
      agentName: '',
      description: summarised.summary,
      filePath: '',
      config: null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: totalCostUsd,
    }
  },
})
