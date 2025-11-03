import { workflowsMeta } from '@pikku/core/workflow'

export const serializeWorkflowMeta = (workflowsMeta: workflowsMeta) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('workflows', 'meta', ${JSON.stringify(workflowsMeta, null, 2)})`
  )
  const workflowsMetaValues = Object.values(workflowsMeta)
  if (workflowsMetaValues.length > 0) {
    serializedOutput.push(
      `export type WorkflowNames = '${workflowsMetaValues.map((w) => w.workflowName).join("' | '")}'`
    )
  }
  return serializedOutput.join('\n')
}
