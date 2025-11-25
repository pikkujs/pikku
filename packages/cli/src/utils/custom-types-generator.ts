import { TypesMap, ZodSchemaRef } from '@pikku/inspector'
import { getFileImportRelativePath } from './file-import-path.js'

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  return `
// Custom types are those that are defined directly within generics
// or are broken into simpler types
${Array.from(typesMap.customTypes.entries())
  .filter(([name, { type }]) => {
    // Skip types that reference undefined generic parameters (like Name, In, Out)
    // These come from helper functions with generic indexed access types that can't be statically analyzed
    // Example: FlattenedRPCMap[Name] where Name is a generic parameter
    const hasUndefinedGeneric =
      /\b(Name|In|Out|Key)\b/.test(type) && /\[.*\]/.test(type)
    return !hasUndefinedGeneric
  })
  .map(([name, { type, references }]) => {
    references.forEach((refName) => {
      // Skip __object types (including those with suffixes like __object_abc123)
      // These are placeholder types created by the inspector for invalid/broken functions
      // (e.g., functions with type errors or missing return statements). Attempting to
      // import these would fail since the source files don't actually export __object.
      if (refName !== '__object' && !refName.startsWith('__object_')) {
        requiredTypes.add(refName)
      }
    })

    // Extract type names from the type string that might not be in references
    const typeString = type
    // Use regex to extract potential type names (PascalCase identifiers)
    const typeNameRegex = /\b[A-Z][a-zA-Z0-9]*\b/g
    const potentialTypes = typeString.match(typeNameRegex) || []

    potentialTypes.forEach((typeName) => {
      // Skip string literals and common keywords
      if (
        typeString.includes(`"${typeName}"`) ||
        ['Pick', 'Omit', 'Partial', 'Required', 'Record', 'Readonly'].includes(
          typeName
        )
      ) {
        return
      }

      // Try to find this type in the typesMap and add it if found
      try {
        const typeMeta = typesMap.getTypeMeta(typeName)
        if (typeMeta.path) {
          // Add originalName to preserve canonical import name
          requiredTypes.add(typeMeta.originalName)
        }
      } catch (e) {
        // Type not found in map (ambient/builtin type) - ignore it
        // Do NOT add to requiredTypes to avoid crashes in serializeImportMap
      }
    })

    return `export type ${name} = ${type}`
  })
  .join('\n')}`
}

/**
 * Generates TypeScript type declarations for Zod schemas.
 * Uses z.infer to derive types from the actual Zod schemas.
 *
 * @param relativeToPath - Path to generate imports relative to
 * @param packageMappings - Package name mappings for imports
 * @param zodSchemas - Map of schema names to their source references
 * @returns Object with imports string and type declarations string
 */
export function generateZodTypes(
  relativeToPath: string,
  packageMappings: Record<string, string>,
  zodSchemas: Map<string, ZodSchemaRef>
): { imports: string; types: string } {
  if (zodSchemas.size === 0) {
    return { imports: '', types: '' }
  }

  // Group schemas by source file for efficient imports
  const schemasByFile = new Map<
    string,
    { schemaName: string; variableName: string }[]
  >()

  for (const [schemaName, ref] of zodSchemas.entries()) {
    const schemas = schemasByFile.get(ref.sourceFile) || []
    schemas.push({ schemaName, variableName: ref.variableName })
    schemasByFile.set(ref.sourceFile, schemas)
  }

  // Generate imports and type declarations
  const imports: string[] = []
  const types: string[] = []

  for (const [sourceFile, schemas] of schemasByFile.entries()) {
    const importPath = getFileImportRelativePath(
      relativeToPath,
      sourceFile,
      packageMappings
    )

    // Import the schema variables (not as types since we need typeof)
    const schemaVars = schemas.map((s) => s.variableName)
    imports.push(`import { ${schemaVars.join(', ')} } from '${importPath}'`)

    // Generate type declarations using z.infer
    for (const { schemaName, variableName } of schemas) {
      types.push(
        `export type ${schemaName} = import('zod').z.infer<typeof ${variableName}>`
      )
    }
  }

  return {
    imports: imports.join('\n'),
    types:
      types.length > 0
        ? `\n// Types inferred from Zod schemas\n${types.join('\n')}`
        : '',
  }
}
