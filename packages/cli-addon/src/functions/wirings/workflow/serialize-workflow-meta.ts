/**
 * Generate workflow meta aggregation file that imports individual workflow JSON files
 * and registers them with pikkuState
 */
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { sanitizeTypeName } from '@pikku/inspector'

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
    return `import { pikkuState } from '@pikku/core/internal'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

const workflowsMeta: SerializedWorkflowGraphs = {}

pikkuState(${pkg}, 'workflows', 'meta', workflowsMeta)`
  }

  const sortedNames = [...workflowNames].sort()

  const imports = sortedNames
    .map((name) => {
      const sanitizedIdentifier = sanitizeTypeName(name)
      const jsonPath = `${metaDir}/${name}.gen.json`
      const importPath = getFileImportRelativePath(
        outputPath,
        jsonPath,
        packageMappings
      )
      return supportsImportAttributes
        ? `import ${sanitizedIdentifier}Meta from '${importPath}' with { type: 'json' }`
        : `import ${sanitizedIdentifier}Meta from '${importPath}'`
    })
    .join('\n')

  const metaEntries = sortedNames
    .map((name) => {
      const sanitizedIdentifier = sanitizeTypeName(name)
      return `  '${name}': ${sanitizedIdentifier}Meta,`
    })
    .join('\n')

  return `import { pikkuState } from '@pikku/core/internal'
import type { SerializedWorkflowGraphs } from '@pikku/inspector/workflow-graph'

${imports}

const workflowsMeta = {
${metaEntries}
} as SerializedWorkflowGraphs

pikkuState(${pkg}, 'workflows', 'meta', workflowsMeta)`
}
