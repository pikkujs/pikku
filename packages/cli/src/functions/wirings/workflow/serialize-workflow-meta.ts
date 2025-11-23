import { WorkflowsMeta } from '@pikku/core/workflow'

export const serializeWorkflowMeta = (workflowsMeta: WorkflowsMeta) => {
  return workflowsMeta
}

export const serializeWorkflowMetaTS = (
  workflowsMeta: WorkflowsMeta,
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push("import { WorkflowsMeta } from '@pikku/core/workflow'")
  serializedOutput.push(importStatement)
  serializedOutput.push('')
  serializedOutput.push(
    "pikkuState('', 'workflows', 'meta', metaData as WorkflowsMeta)"
  )
  serializedOutput.push('')

  const workflowsMetaValues = Object.values(workflowsMeta)
  if (workflowsMetaValues.length > 0) {
    serializedOutput.push(
      `export type WorkflowNames = '${workflowsMetaValues.map((w) => w.workflowName).join("' | '")}'`
    )
  }
  return serializedOutput.join('\n')
}
