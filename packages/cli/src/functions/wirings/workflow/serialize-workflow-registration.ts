import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const serializeWorkflowRegistration = (
  outputPath: string,
  metaImportPath: string,
  workflowNames: string[],
  workflowFiles: Map<string, { path: string; exportedName: string }>,
  _graphFiles: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string>,
  _packageName?: string
) => {
  const lines: string[] = []
  const hasWorkflows = workflowNames.length > 0
  const hasDslWorkflows = workflowFiles.size > 0

  if (hasDslWorkflows) {
    lines.push(`import { addWorkflow } from '@pikku/core/workflow'`)
  }

  if (hasWorkflows) {
    lines.push(`import '${metaImportPath}'`)
  }

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

  for (const [pikkuFuncId, { exportedName }] of sortedWorkflows) {
    lines.push(`addWorkflow('${pikkuFuncId}', ${exportedName})`)
  }

  if (hasWorkflows) {
    lines.push('')
    lines.push(`export type WorkflowNames = '${workflowNames.join("' | '")}'`)
  }

  return lines.join('\n')
}
