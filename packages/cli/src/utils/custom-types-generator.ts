import { TypesMap } from '@pikku/inspector'

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  return `
// Custom types are those that are defined directly within generics
// or are broken into simpler types
${Array.from(typesMap.customTypes.entries())
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
