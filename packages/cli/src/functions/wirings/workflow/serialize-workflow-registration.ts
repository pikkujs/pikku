/**
 * Generate workflow runtime registration
 * Combines meta registration (pikkuState) and DSL workflow registration (addWorkflow)
 */
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const serializeWorkflowRegistration = (
  outputPath: string,
  jsonImportPath: string,
  workflowNames: string[],
  workflowFiles: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string>,
  supportsImportAttributes: boolean,
  packageName?: string
) => {
  const lines: string[] = []
  const hasWorkflows = workflowNames.length > 0
  const hasDslWorkflows = workflowFiles.size > 0

  // Imports - only add if they'll be used
  if (hasWorkflows) {
    lines.push("import { pikkuState } from '@pikku/core'")
    lines.push(
      "import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'"
    )
  }
  if (hasDslWorkflows) {
    lines.push("import { addWorkflow } from '@pikku/core/workflow'")
  }

  // Import JSON meta
  if (hasWorkflows) {
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`
    lines.push(importStatement)
  }

  // Import DSL workflow functions
  const sortedWorkflows = Array.from(workflowFiles.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  for (const [, { path, exportedName }] of sortedWorkflows) {
    const importPath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )
    lines.push(`import { ${exportedName} } from '${importPath}'`)
  }

  lines.push('')

  // Register meta to pikkuState
  if (hasWorkflows) {
    const packageNameValue = packageName ? `'${packageName}'` : 'null'
    lines.push(
      `pikkuState(${packageNameValue}, 'workflows', 'meta', metaData as SerializedWorkflowGraphs)`
    )
    lines.push('')
  }

  // Register DSL workflows
  for (const [pikkuFuncName, { exportedName }] of sortedWorkflows) {
    lines.push(`addWorkflow('${pikkuFuncName}', ${exportedName})`)
  }

  // Export workflow names type
  if (hasWorkflows) {
    lines.push('')
    lines.push(`export type WorkflowNames = '${workflowNames.join("' | '")}'`)
  }

  return lines.join('\n')
}
