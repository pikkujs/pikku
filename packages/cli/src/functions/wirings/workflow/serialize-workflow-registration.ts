/**
 * Generate workflow runtime registration
 * Imports meta (which registers with pikkuState) and registers DSL workflows (addWorkflow) and graph workflows (addWorkflowGraph)
 */
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const serializeWorkflowRegistration = (
  outputPath: string,
  metaImportPath: string,
  workflowNames: string[],
  workflowFiles: Map<string, { path: string; exportedName: string }>,
  graphFiles: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string>,
  _packageName?: string
) => {
  const lines: string[] = []
  const hasWorkflows = workflowNames.length > 0
  const hasDslWorkflows = workflowFiles.size > 0
  const hasGraphWorkflows = graphFiles.size > 0

  // Imports
  const imports: string[] = []
  if (hasDslWorkflows) {
    imports.push('addWorkflow')
  }
  if (hasGraphWorkflows) {
    imports.push('addWorkflowGraph')
  }
  if (imports.length > 0) {
    lines.push(`import { ${imports.join(', ')} } from '@pikku/core/workflow'`)
  }

  // Import meta file (which registers meta with pikkuState)
  if (hasWorkflows) {
    lines.push(`import '${metaImportPath}'`)
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

  // Import graph workflow definitions
  const sortedGraphWorkflows = Array.from(graphFiles.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  for (const [, { path, exportedName }] of sortedGraphWorkflows) {
    const importPath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )
    lines.push(`import { ${exportedName} } from '${importPath}'`)
  }

  lines.push('')

  // Register DSL workflows
  for (const [pikkuFuncName, { exportedName }] of sortedWorkflows) {
    lines.push(`addWorkflow('${pikkuFuncName}', ${exportedName})`)
  }

  // Register graph workflows
  for (const [workflowName, { exportedName }] of sortedGraphWorkflows) {
    lines.push(`addWorkflowGraph('${workflowName}', ${exportedName})`)
  }

  // Export workflow names type
  if (hasWorkflows) {
    lines.push('')
    lines.push(`export type WorkflowNames = '${workflowNames.join("' | '")}'`)
  }

  return lines.join('\n')
}
