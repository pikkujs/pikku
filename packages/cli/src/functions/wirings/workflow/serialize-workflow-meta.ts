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
  const pkg = packageName ? `'${packageName}'` : 'null'

  if (workflowNames.length === 0) {
    return `import { pikkuState } from '@pikku/core'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

const workflowsMeta: SerializedWorkflowGraphs = {}

pikkuState(${pkg}, 'workflows', 'meta', workflowsMeta)`
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

pikkuState(${pkg}, 'workflows', 'meta', workflowsMeta)`
}
