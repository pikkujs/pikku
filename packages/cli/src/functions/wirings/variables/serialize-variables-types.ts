import {
  VariableDefinitionsMeta,
  VariableDefinitions,
} from '@pikku/core/variable'
import { SchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface SerializeVariablesOptions {
  definitions: VariableDefinitions
  schemaLookup: Map<string, SchemaRef>
  variablesFile: string
  packageMappings: Record<string, string>
}

export function validateAndBuildVariableDefinitionsMeta(
  definitions: VariableDefinitions,
  schemaLookup: Map<string, SchemaRef>
): VariableDefinitionsMeta {
  const meta: VariableDefinitionsMeta = {}
  const variableIdToDefinition: Map<string, VariableDefinitions[0]> = new Map()

  for (const def of definitions) {
    const existingDef = variableIdToDefinition.get(def.variableId)

    if (existingDef) {
      // Same variableId - validate schemas are identical
      if (def.schema && existingDef.schema) {
        const defSchemaRef = schemaLookup.get(def.schema as string)
        const existingSchemaRef = schemaLookup.get(existingDef.schema as string)

        if (defSchemaRef && existingSchemaRef) {
          if (
            defSchemaRef.variableName !== existingSchemaRef.variableName ||
            defSchemaRef.sourceFile !== existingSchemaRef.sourceFile
          ) {
            throw new Error(
              `Variable '${def.variableId}' is defined with different schemas.\n` +
                `  First definition: ${existingDef.sourceFile} (schema: ${existingSchemaRef.variableName})\n` +
                `  Second definition: ${def.sourceFile} (schema: ${defSchemaRef.variableName})\n` +
                `Variables sharing a variableId must use the same schema.`
            )
          }
        }
      }

      if (!meta[def.name]) {
        meta[def.name] = {
          name: def.name,
          displayName: def.displayName,
          description: def.description,
          variableId: def.variableId,
          schema: def.schema,
          sourceFile: def.sourceFile,
        }
      }
      continue
    }

    variableIdToDefinition.set(def.variableId, def)

    if (!meta[def.name]) {
      meta[def.name] = {
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        variableId: def.variableId,
        schema: def.schema,
        sourceFile: def.sourceFile,
      }
    }
  }

  return meta
}

/**
 * Generates the VariablesMap type and TypedVariablesService wrapper.
 * Maps each variableId to its corresponding TypeScript type.
 * Validates that duplicate variables have identical schemas.
 */
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

  // Collect imports needed
  const schemaImports: Map<string, Set<string>> = new Map()
  let needsZod = false

  // Build VariablesMap entries
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

  // Generate imports
  const imports: string[] = []

  imports.push(`import type { VariablesService } from '@pikku/core/services'`)

  if (needsZod) {
    imports.push(`import type { z } from 'zod'`)
  }

  // Add schema imports
  for (const [sourceFile, variableNames] of schemaImports) {
    const importPath = getFileImportRelativePath(
      variablesFile,
      sourceFile,
      packageMappings
    )
    const vars = Array.from(variableNames).join(', ')
    imports.push(`import { ${vars} } from '${importPath}'`)
  }

  return `/**
 * Typed variables wrapper for variable access.
 * Generated from wireVariable declarations.
 */

${imports.join('\n')}

/**
 * Map of variable IDs to their types.
 */
export interface VariablesMap {
${mapEntries.join('\n')}
}

/**
 * Union of all declared variable IDs.
 */
export type VariableId = keyof VariablesMap

/**
 * Variable status information
 */
export interface VariableStatus {
  variableId: string
  name: string
  displayName: string
  isConfigured: boolean
}

/**
 * Variables metadata for runtime status checking
 */
const VARIABLES_META: Record<string, { name: string; displayName: string }> = {
${metaEntries.join(',\n')}
}

/**
 * Typed wrapper for VariablesService that provides:
 * - Type-safe access to variables by variableId
 * - Full VariablesService interface compatibility
 * - Status checking without throwing errors
 * - Visibility into all declared variables
 */
export class TypedVariablesService implements VariablesService {
  constructor(private variables: VariablesService) {}

  /**
   * Get a variable value.
   * @param name - The variable ID (compile-time validated)
   * @returns The variable value or undefined
   */
  get(name: VariableId): Promise<string | undefined> | string | undefined
  get(name: string): Promise<string | undefined> | string | undefined
  get(name: string): Promise<string | undefined> | string | undefined {
    return this.variables.get(name)
  }

  getJSON<K extends VariableId>(name: K): Promise<VariablesMap[K] | undefined> | VariablesMap[K] | undefined
  getJSON<T = unknown>(name: string): Promise<T | undefined> | T | undefined
  getJSON(name: string): Promise<unknown> | unknown {
    return this.variables.getJSON(name)
  }

  /**
   * Get all variables.
   */
  getAll(): Promise<Record<string, string | undefined>> | Record<string, string | undefined> {
    return this.variables.getAll()
  }

  /**
   * Get status of all declared variables.
   * Useful for UI display and pre-validation.
   * @returns Array of variable statuses
   */
  async getAllStatus(): Promise<VariableStatus[]> {
    const results: VariableStatus[] = []
    const all = await this.variables.getAll()

    for (const [variableId, meta] of Object.entries(VARIABLES_META)) {
      results.push({
        variableId,
        name: meta.name,
        displayName: meta.displayName,
        isConfigured: all[variableId] !== undefined,
      })
    }

    return results
  }

  /**
   * Get only the variables that are missing/not configured.
   * @returns Array of missing variable statuses
   */
  async getMissing(): Promise<VariableStatus[]> {
    const all = await this.getAllStatus()
    return all.filter((v) => !v.isConfigured)
  }
}
`
}
