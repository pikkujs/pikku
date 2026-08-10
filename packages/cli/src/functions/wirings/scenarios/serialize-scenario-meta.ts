import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { sanitizeTypeName } from '@pikku/inspector'

/**
 * Scenario workflow meta, merged onto whatever the app registered rather than
 * replacing it — `pikkuState(…, 'workflows', 'meta', value)` is a wholesale
 * setter, and the app's own meta file is one. The app file is imported here so
 * the ordering holds however this module is reached, not only through the
 * generated scenario bootstrap.
 */
export const serializeScenarioWorkflowMeta = (
  outputPath: string,
  metaDir: string,
  appMetaImportPath: string,
  scenarioNames: string[],
  packageMappings: Record<string, string>,
  supportsImportAttributes: boolean,
  packageName?: string
) => {
  const pkg = packageName ? `'${packageName}'` : 'null'
  const sortedNames = [...scenarioNames].sort()

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
    .map((name) => `  '${name}': ${sanitizeTypeName(name)}Meta,`)
    .join('\n')

  return `import { pikkuState } from '@pikku/core/ecosystem'
import type { WorkflowsRuntimeMeta } from '@pikku/core/workflow/types'
import '${appMetaImportPath}'
${imports ? `\n${imports}\n` : ''}
const scenariosMeta = {
${metaEntries}
} as WorkflowsRuntimeMeta

pikkuState(${pkg}, 'workflows', 'meta', {
  ...pikkuState(${pkg}, 'workflows', 'meta'),
  ...scenariosMeta,
})`
}

/**
 * Scenario step meta, merged onto the app's function meta for the same reason.
 */
export const serializeScenarioFunctionMeta = (
  jsonImportPath: string,
  appMetaImportPath: string,
  supportsImportAttributes: boolean,
  packageName?: string
) => {
  const pkg = packageName ? `'${packageName}'` : 'null'
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  return `import { pikkuState } from '@pikku/core/ecosystem'
import type { FunctionsMeta } from '@pikku/core'
import '${appMetaImportPath}'
${importStatement}

pikkuState(${pkg}, 'function', 'meta', {
  ...pikkuState(${pkg}, 'function', 'meta'),
  ...(metaData as FunctionsMeta),
})`
}
