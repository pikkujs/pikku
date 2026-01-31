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
  const packageNameValue = packageName ? `'${packageName}'` : 'null'

  if (workflowNames.length === 0) {
    // Empty meta file - still need to register empty meta and wires
    lines.push("import { pikkuState } from '@pikku/core'")
    lines.push(
      "import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'"
    )
    lines.push('')
    lines.push('const workflowsMeta: SerializedWorkflowGraphs = {}')
    lines.push('')
    lines.push(
      `pikkuState(${packageNameValue}, 'workflows', 'meta', workflowsMeta)`
    )
    lines.push(
      `pikkuState(${packageNameValue}, 'workflows', 'wires', { http: {}, trigger: {} })`
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
  lines.push(
    `pikkuState(${packageNameValue}, 'workflows', 'meta', workflowsMeta)`
  )

  lines.push('')

  // Build unified wires index from workflow metadata
  lines.push('// Build unified wires index from workflow metadata')
  lines.push(
    'const httpWires: Record<string, { workflowName: string; startNode?: string }> = {}'
  )
  lines.push(
    'const triggerWires: Record<string, Array<{ workflowName: string; startNode: string }>> = {}'
  )
  lines.push('for (const [name, meta] of Object.entries(workflowsMeta)) {')
  lines.push('  if (meta.wires?.http) {')
  lines.push('    for (const h of meta.wires.http) {')
  lines.push(
    '      httpWires[`${h.method}:${h.route}`] = { workflowName: name, startNode: h.startNode }'
  )
  lines.push('    }')
  lines.push('  }')
  lines.push('  if (meta.wires?.trigger) {')
  lines.push('    for (const t of meta.wires.trigger) {')
  lines.push('      if (!triggerWires[t.name]) triggerWires[t.name] = []')
  lines.push(
    '      triggerWires[t.name]!.push({ workflowName: name, startNode: t.startNode })'
  )
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push(
    `pikkuState(${packageNameValue}, 'workflows', 'wires', { http: httpWires, trigger: triggerWires })`
  )

  return lines.join('\n')
}
