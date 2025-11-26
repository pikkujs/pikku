import { TypesMap } from '@pikku/inspector'

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  return `
${Array.from(typesMap.customTypes.entries())
  .filter(([name, { type }]) => {
    const hasUndefinedGeneric =
      /\b(Name|In|Out|Key)\b/.test(type) && /\[.*\]/.test(type)
    return !hasUndefinedGeneric
  })
  .map(([name, { type, references }]) => {
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
        ['Pick', 'Omit', 'Partial', 'Required', 'Record', 'Readonly'].includes(
          typeName
        )
      ) {
        return
      }

      try {
        const typeMeta = typesMap.getTypeMeta(typeName)
        if (typeMeta.path) {
          requiredTypes.add(typeMeta.originalName)
        }
      } catch (e) {
        // Type not found in map (ambient/builtin type)
      }
    })

    return `export type ${name} = ${type}`
  })
  .join('\n')}`
}
