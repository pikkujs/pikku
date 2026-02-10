import { TypesMap } from '@pikku/inspector'

export function sanitizeTypeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_$]/g, '_')
}

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  const typeDeclarations = Array.from(typesMap.customTypes.entries())
    .filter(([_name, { type }]) => {
      const hasUndefinedGeneric =
        /\b(Name|In|Out|Key)\b/.test(type) && /\[.*\]/.test(type)
      return !hasUndefinedGeneric
    })
    .map(([originalName, { type, references }]) => {
      const name = sanitizeTypeName(originalName)
      references.forEach((refName) => {
        if (refName !== '__object' && !refName.startsWith('__object_')) {
          requiredTypes.add(refName)
        }
      })

      const typeString = type
      const typeNameRegex = /\b[A-Z][a-zA-Z0-9]*\b/g
      const potentialTypes = typeString.match(typeNameRegex) || []

      potentialTypes.forEach((typeName) => {
        if (
          typeString.includes(`"${typeName}"`) ||
          [
            'Pick',
            'Omit',
            'Partial',
            'Required',
            'Record',
            'Readonly',
          ].includes(typeName)
        ) {
          return
        }

        try {
          const typeMeta = typesMap.getTypeMeta(typeName)
          if (typeMeta.path) {
            requiredTypes.add(typeMeta.originalName)
          }
        } catch {
          // Type not found in map (ambient/builtin type)
        }
      })

      return `export type ${name} = ${type}`
    })

  const importsByPath = new Map<string, Set<string>>()
  for (const typeName of requiredTypes) {
    try {
      const typeMeta = typesMap.getTypeMeta(typeName)
      if (typeMeta.path) {
        if (!importsByPath.has(typeMeta.path)) {
          importsByPath.set(typeMeta.path, new Set())
        }
        importsByPath.get(typeMeta.path)!.add(typeMeta.originalName)
      }
    } catch {
      // Type not found in map
    }
  }

  const importLines = Array.from(importsByPath.entries())
    .map(
      ([path, types]) =>
        `import type { ${Array.from(types).join(', ')} } from '${path}'`
    )
    .join('\n')

  return `${importLines}\n\n${typeDeclarations.join('\n')}`
}
