import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { WiringFileMap } from './scenario-partition.js'

/**
 * The scenario counterpart of `serializeWorkflowRegistration`: registers the
 * scenarios and features that were held back from the app wirings, so they
 * exist only in the module graph `pikku scenario run` loads.
 */
export const serializeScenarioRegistration = (
  outputPath: string,
  metaImportPath: string,
  scenarioFiles: WiringFileMap,
  featureFiles: WiringFileMap,
  packageMappings: Record<string, string>,
  packageName?: string
) => {
  const hasScenarios = scenarioFiles.size > 0
  const hasFeatures = featureFiles.size > 0

  if (!hasScenarios && !hasFeatures) {
    return 'export {}'
  }

  const lines: string[] = []

  if (hasScenarios) {
    lines.push(`import { addWorkflow } from '@pikku/core/workflow'`)
  }
  if (hasFeatures) {
    lines.push(`import { addFeature } from '@pikku/core/ecosystem/scenario'`)
  }
  lines.push(`import '${metaImportPath}'`)

  const sortedScenarios = Array.from(scenarioFiles.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  // A feature holds the very objects its scenarios were registered with, so it
  // has to be imported for its membership to be resolvable at all.
  const sortedFeatures = Array.from(featureFiles.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  for (const [, { path, exportedName }] of [
    ...sortedScenarios,
    ...sortedFeatures,
  ]) {
    const importPath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )
    lines.push(`import { ${exportedName} } from '${importPath}'`)
  }

  lines.push('')

  const packageArg = packageName ? `, '${packageName}'` : ''
  for (const [pikkuFuncId, { exportedName }] of sortedScenarios) {
    lines.push(`addWorkflow('${pikkuFuncId}', ${exportedName}${packageArg})`)
  }
  for (const [featureId, { exportedName }] of sortedFeatures) {
    lines.push(`addFeature('${featureId}', ${exportedName}${packageArg})`)
  }

  return lines.join('\n')
}
