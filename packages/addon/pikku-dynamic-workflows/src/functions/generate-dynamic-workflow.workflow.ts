import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const generateDynamicWorkflow = pikkuWorkflowComplexFunc<
  { prompt: string; name?: string; functionFilter?: string[] },
  {
    success: boolean
    workflowName: string
    description: string
    graph: any
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  description: 'Generates a dynamic workflow from a natural language prompt',
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

    const functions = await workflow.do(
      'List functions',
      'listDynamicFunctions',
      null
    )

    let selectedNames: string[]

    if (data.functionFilter && data.functionFilter.length > 0) {
      selectedNames = data.functionFilter
    } else {
      const selected = await workflow.do(
        'Select functions',
        'aiSelectFunctions',
        {
          prompt: data.prompt,
          functions: functions.summaries,
        }
      )
      selectedNames = selected.names
      totalInputTokens += selected.inputTokens || 0
      totalOutputTokens += selected.outputTokens || 0
      totalCostUsd += selected.costUsd || 0
    }

    const schemas = await workflow.do('Get schemas', 'getFunctionSchemas', {
      names: selectedNames,
    })

    let lastError = ''

    for (let attempt = 0; attempt < 3; attempt++) {
      const graph = await workflow.do(
        'Generate graph',
        'aiGenerateGraph',
        lastError
          ? {
              prompt: data.prompt,
              schemas: schemas.details,
              previousError: lastError,
            }
          : { prompt: data.prompt, schemas: schemas.details }
      )
      totalInputTokens += graph.inputTokens || 0
      totalOutputTokens += graph.outputTokens || 0
      totalCostUsd += graph.costUsd || 0

      const validation = await workflow.do(
        'Validate graph',
        'validateDynamicWorkflow',
        {
          nodes: graph.nodes,
          functionNames: selectedNames,
        }
      )

      if (validation.valid) {
        let workflowName = data.name
        if (!workflowName) {
          const naming = await workflow.do('Name workflow', 'aiNameWorkflow', {
            prompt: data.prompt,
          })
          workflowName = naming.name
          totalInputTokens += naming.inputTokens || 0
          totalOutputTokens += naming.outputTokens || 0
          totalCostUsd += naming.costUsd || 0
        }

        const stored = await workflow.do(
          'Store workflow',
          'storeDynamicWorkflow',
          {
            name: workflowName,
            nodes: graph.nodes,
            workflowDescription: summarised.summary,
            entryNodeIds: validation.entryNodeIds,
          }
        )
        return {
          success: true,
          workflowName: stored.workflowName,
          description: summarised.summary,
          graph: graph.nodes,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
        }
      }
      lastError = validation.errors.join('\n')
    }

    return {
      success: false,
      workflowName: '',
      description: summarised.summary,
      graph: null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: totalCostUsd,
    }
  },
})
