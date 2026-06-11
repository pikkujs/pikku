import type { TypesMap } from '../types-map.js'

/**
 * NOTE: Code generation normally belongs in @pikku/cli, not the inspector.
 * This is here because the schema generator needs the custom types content
 * as a virtual TypeScript source file (in-memory, no disk write) so that
 * ts-json-schema-generator can discover inline/custom types from typesMap.
 */

export function sanitizeTypeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_$]/g, '_')
}

const CLASSIFICATION_WRAPPERS = new Set(['Private', 'Pii', 'Secret'])

function findMatchingAngleBracket(type: string, startIndex: number): number {
  let depth = 0
  for (let i = startIndex; i < type.length; i += 1) {
    const char = type[i]
    if (char === '<') {
      depth += 1
      continue
    }
    if (char === '>') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

function stripClassificationWrappers(type: string): string {
  let output = ''
  let index = 0

  while (index < type.length) {
    const char = type[index]
    if (!/[A-Za-z_$]/.test(char)) {
      output += char
      index += 1
      continue
    }

    let end = index + 1
    while (end < type.length && /[A-Za-z0-9_$]/.test(type[end])) {
      end += 1
    }

    const identifier = type.slice(index, end)
    if (CLASSIFICATION_WRAPPERS.has(identifier) && type[end] === '<') {
      const closingIndex = findMatchingAngleBracket(type, end)
      if (closingIndex !== -1) {
        const inner = type.slice(end + 1, closingIndex)
        output += stripClassificationWrappers(inner)
        index = closingIndex + 1
        continue
      }
    }

    output += identifier
    index = end
  }

  return output
}

export function generateCustomTypes(
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  const typeDeclarations = Array.from(typesMap.customTypes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([_name, { type }]) => {
      const hasUndefinedGeneric =
        /\b(Name|In|Out|Key)\b/.test(type) && /\[.*\]/.test(type)
      return !hasUndefinedGeneric
    })
    .map(([originalName, { type, references }]) => {
      const name = sanitizeTypeName(originalName)
      references.forEach((refName) => {
        if (
          refName !== '__object' &&
          !refName.startsWith('__object_') &&
          !CLASSIFICATION_WRAPPERS.has(refName)
        ) {
          requiredTypes.add(refName)
        }
      })

      const typeString = stripClassificationWrappers(type)
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

      if (name === typeString) return null
      return `export type ${name} = ${typeString}`
    })

  const importsByPath = new Map<string, Set<string>>()
  for (const typeName of requiredTypes) {
    if (CLASSIFICATION_WRAPPERS.has(typeName)) continue
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

  return `${importLines}\n\n${typeDeclarations.filter(Boolean).join('\n')}`
}
