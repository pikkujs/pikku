import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const generateDynamicWorkflow = pikkuWorkflowComplexFunc<
  { prompt: string; name: string },
  {
    success: boolean
    workflowName: string
    graph: any
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  description: 'Generates a dynamic workflow from a natural language prompt',
  expose: true,
  func: async ({}, data, { workflow }) => {
    const functions = await workflow.do(
      'List functions',
      'listDynamicFunctions',
      null
    )

    const selected = await workflow.do(
      'Select functions',
      'aiSelectFunctions',
      {
        prompt: data.prompt,
        functions: functions.summaries,
      }
    )

    const schemas = await workflow.do('Get schemas', 'getFunctionSchemas', {
      names: selected.names,
    })

    let lastError = ''
    let totalInputTokens = selected.inputTokens || 0
    let totalOutputTokens = selected.outputTokens || 0
    let totalCostUsd = selected.costUsd || 0

    for (let attempt = 0; attempt < 3; attempt++) {
      const graph = await workflow.do(
        'Generate graph',
        'aiGenerateGraph',
        {
          prompt: data.prompt,
          schemas: schemas.details,
          previousError: lastError || undefined,
        }
      )
      totalInputTokens += graph.inputTokens || 0
      totalOutputTokens += graph.outputTokens || 0
      totalCostUsd += graph.costUsd || 0

      const validation = await workflow.do(
        'Validate graph',
        'validateDynamicWorkflow',
        {
          nodes: graph.nodes,
          functionNames: selected.names,
        }
      )

      if (validation.valid) {
        const stored = await workflow.do(
          'Store workflow',
          'storeDynamicWorkflow',
          {
            name: data.name,
            nodes: graph.nodes,
            workflowDescription: data.prompt,
            entryNodeIds: validation.entryNodeIds,
          }
        )
        return {
          success: true,
          workflowName: stored.workflowName,
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
      graph: null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: totalCostUsd,
    }
  },
})
