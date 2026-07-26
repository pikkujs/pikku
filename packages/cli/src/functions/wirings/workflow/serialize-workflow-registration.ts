import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const serializeWorkflowRegistration = (
  outputPath: string,
  metaImportPath: string,
  workflowNames: string[],
  workflowFiles: Map<string, { path: string; exportedName: string }>,
  _graphFiles: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string>,
  packageName?: string,
  featureFiles: Map<string, { path: string; exportedName: string }> = new Map()
) => {
  const lines: string[] = []
  const hasWorkflows = workflowNames.length > 0
  const hasDslWorkflows = workflowFiles.size > 0
  const hasFeatures = featureFiles.size > 0

  const registrars = [
    ...(hasDslWorkflows ? ['addWorkflow'] : []),
    ...(hasFeatures ? ['addFeature'] : []),
  ]
  if (registrars.length > 0) {
    lines.push(
      `import { ${registrars.join(', ')} } from '@pikku/core/workflow'`
    )
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

  // A feature holds the very objects its scenarios were registered with, so it
  // has to be imported for its membership to be resolvable at all.
  const sortedFeatures = Array.from(featureFiles.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  for (const [, { path, exportedName }] of sortedFeatures) {
    const importPath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )
    lines.push(`import { ${exportedName} } from '${importPath}'`)
  }

  lines.push('')

  const packageArg = packageName ? `, '${packageName}'` : ''
  for (const [pikkuFuncId, { exportedName }] of sortedWorkflows) {
    lines.push(`addWorkflow('${pikkuFuncId}', ${exportedName}${packageArg})`)
  }

  for (const [featureId, { exportedName }] of sortedFeatures) {
    lines.push(`addFeature('${featureId}', ${exportedName}${packageArg})`)
  }

  if (hasWorkflows) {
    lines.push('')
    lines.push(`export type WorkflowNames = '${workflowNames.join("' | '")}'`)
  }

  return lines.join('\n')
}
