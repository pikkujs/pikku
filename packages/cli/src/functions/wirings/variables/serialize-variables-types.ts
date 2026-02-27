import type { VariableDefinitions } from '@pikku/core/variable'
import { validateAndBuildVariableDefinitionsMeta } from '@pikku/core/variable'
import type { SchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface SerializeVariablesOptions {
  definitions: VariableDefinitions
  schemaLookup: Map<string, SchemaRef>
  variablesFile: string
  packageMappings: Record<string, string>
}

export const serializeVariablesTypes = ({
  definitions,
  schemaLookup,
  variablesFile,
  packageMappings,
}: SerializeVariablesOptions) => {
  const variables = validateAndBuildVariableDefinitionsMeta(
    definitions,
    schemaLookup
  )
  const variableEntries = Object.entries(variables)

  const schemaImports: Map<string, Set<string>> = new Map()
  let needsZod = false

  const mapEntries: string[] = []
  const metaEntries: string[] = []

  for (const [name, meta] of variableEntries) {
    if (meta.schema && typeof meta.schema === 'string') {
      const schemaRef = schemaLookup.get(meta.schema)
      if (schemaRef) {
        needsZod = true
        if (!schemaImports.has(schemaRef.sourceFile)) {
          schemaImports.set(schemaRef.sourceFile, new Set())
        }
        schemaImports.get(schemaRef.sourceFile)!.add(schemaRef.variableName)

        mapEntries.push(
          `  '${meta.variableId}': z.infer<typeof ${schemaRef.variableName}>`
        )
        metaEntries.push(
          `  '${meta.variableId}': { name: '${name}', displayName: '${meta.displayName}' }`
        )
      }
    }
  }

  const imports: string[] = []

  imports.push(
    `import { TypedVariablesService as CoreTypedVariablesService, type VariableMeta } from '@pikku/core/services'`
  )
  imports.push(`import type { VariablesService } from '@pikku/core/services'`)

  if (needsZod) {
    imports.push(`import type { z } from 'zod'`)
  }

  for (const [sourceFile, variableNames] of schemaImports) {
    const importPath = getFileImportRelativePath(
      variablesFile,
      sourceFile,
      packageMappings
    )
    const vars = Array.from(variableNames).join(', ')
    imports.push(`import { ${vars} } from '${importPath}'`)
  }

  return `${imports.join('\n')}

export interface VariablesMap {
${mapEntries.join('\n')}
}

export type VariableId = keyof VariablesMap

const VARIABLES_META: Record<string, VariableMeta> = {
${metaEntries.join(',\n')}
}

export class TypedVariablesService extends CoreTypedVariablesService<VariablesMap> {
  constructor(variables: VariablesService) {
    super(variables, VARIABLES_META)
  }
}
`
}
