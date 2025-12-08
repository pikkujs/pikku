/**
 * Generate workflow meta aggregation file that imports individual workflow JSON files
 * and registers them with pikkuState
 */
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const serializeWorkflowMeta = (
  outputPath: string,
  metaDir: string,
  workflowNames: string[],
  packageMappings: Record<string, string>,
  supportsImportAttributes: boolean,
  packageName?: string
) => {
  const lines: string[] = []

  if (workflowNames.length === 0) {
    // Empty meta file - still need to register empty meta
    lines.push("import { pikkuState } from '@pikku/core'")
    lines.push(
      "import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'"
    )
    lines.push('')
    lines.push('const workflowsMeta: SerializedWorkflowGraphs = {}')
    lines.push('')
    const packageNameValue = packageName ? `'${packageName}'` : 'null'
    lines.push(
      `pikkuState(${packageNameValue}, 'workflows', 'meta', workflowsMeta)`
    )
    return lines.join('\n')
  }

  // Imports
  lines.push("import { pikkuState } from '@pikku/core'")
  lines.push(
    "import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'"
  )
  lines.push('')

  // Import each workflow meta JSON
  const sortedNames = [...workflowNames].sort()
  for (const name of sortedNames) {
    const jsonPath = `${metaDir}/${name}.gen.json`
    const importPath = getFileImportRelativePath(
      outputPath,
      jsonPath,
      packageMappings
    )
    const importStatement = supportsImportAttributes
      ? `import ${name}Meta from '${importPath}' with { type: 'json' }`
      : `import ${name}Meta from '${importPath}'`
    lines.push(importStatement)
  }

  lines.push('')

  // Create aggregated meta object (cast JSON imports to proper types)
  lines.push('const workflowsMeta = {')
  for (const name of sortedNames) {
    lines.push(`  '${name}': ${name}Meta,`)
  }
  lines.push('} as SerializedWorkflowGraphs')

  lines.push('')

  // Register meta with pikkuState
  const packageNameValue = packageName ? `'${packageName}'` : 'null'
  lines.push(
    `pikkuState(${packageNameValue}, 'workflows', 'meta', workflowsMeta)`
  )

  return lines.join('\n')
}
