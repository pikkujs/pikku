/**
 * Generate workflow meta aggregation file that imports individual workflow JSON files
 * and registers them with pikkuState
 */
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

const EMPTY_WIRES = '{ http: {}, trigger: {} }'

export const serializeWorkflowMeta = (
  outputPath: string,
  metaDir: string,
  workflowNames: string[],
  packageMappings: Record<string, string>,
  supportsImportAttributes: boolean,
  packageName?: string
) => {
  const pkg = packageName ? `'${packageName}'` : 'null'

  if (workflowNames.length === 0) {
    return `import { pikkuState } from '@pikku/core'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

const workflowsMeta: SerializedWorkflowGraphs = {}

pikkuState(${pkg}, 'workflows', 'meta', workflowsMeta)
pikkuState(${pkg}, 'workflows', 'wires', ${EMPTY_WIRES})`
  }

  const sortedNames = [...workflowNames].sort()

  const imports = sortedNames
    .map((name) => {
      const jsonPath = `${metaDir}/${name}.gen.json`
      const importPath = getFileImportRelativePath(
        outputPath,
        jsonPath,
        packageMappings
      )
      return supportsImportAttributes
        ? `import ${name}Meta from '${importPath}' with { type: 'json' }`
        : `import ${name}Meta from '${importPath}'`
    })
    .join('\n')

  const metaEntries = sortedNames
    .map((name) => `  '${name}': ${name}Meta,`)
    .join('\n')

  return `import { pikkuState } from '@pikku/core'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

${imports}

const workflowsMeta = {
${metaEntries}
} as SerializedWorkflowGraphs

pikkuState(${pkg}, 'workflows', 'meta', workflowsMeta)

// Build unified wires index from workflow metadata
const httpWires: Record<string, { workflowName: string; startNode?: string }> = {}
const triggerWires: Record<string, Array<{ workflowName: string; startNode: string }>> = {}
for (const [name, meta] of Object.entries(workflowsMeta)) {
  if (meta.wires?.http) {
    for (const h of meta.wires.http) {
      httpWires[\`\${h.method}:\${h.route}\`] = { workflowName: name, startNode: h.startNode }
    }
  }
  if (meta.wires?.trigger) {
    for (const t of meta.wires.trigger) {
      if (!triggerWires[t.name]) triggerWires[t.name] = []
      triggerWires[t.name]!.push({ workflowName: name, startNode: t.startNode })
    }
  }
}
pikkuState(${pkg}, 'workflows', 'wires', { http: httpWires, trigger: triggerWires })`
}
