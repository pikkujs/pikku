import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Generate workflow registration wirings
 * Imports all workflow functions and calls addWorkflow for each
 */
export const serializeWorkflowWirings = (
  outputPath: string,
  workflowFiles: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string> = {}
) => {
  const imports: string[] = []
  const registrations: string[] = []

  // Sort by pikkuFuncName for consistent output
  const sortedWorkflows = Array.from(workflowFiles.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  // Generate imports
  for (const [, { path, exportedName }] of sortedWorkflows) {
    const importPath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )
    imports.push(`import { ${exportedName} } from '${importPath}'`)
  }

  // Generate addWorkflow calls
  for (const [pikkuFuncName, { exportedName }] of sortedWorkflows) {
    registrations.push(`addWorkflow('${pikkuFuncName}', ${exportedName})`)
  }

  // Only import addWorkflow if there are workflows to register
  const addWorkflowImport =
    sortedWorkflows.length > 0
      ? `import { addWorkflow } from '@pikku/core/workflow'\n\n`
      : ''

  return `/**
 * Auto-generated workflow registrations
 * Do not edit manually - regenerate with 'npx pikku'
 */
${addWorkflowImport}${imports.join('\n')}${imports.length > 0 ? '\n\n' : ''}${registrations.join('\n')}
`
}
