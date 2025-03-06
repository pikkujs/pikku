import * as ts from 'typescript'
import { TypesMap } from './types-map.js'
import { InspectorFilters } from './types.js'

type FunctionTypes = {
  inputTypes: ts.Type[]
  inputs: null | string[]
  outputTypes: ts.Type[]
  outputs: null | string[]
}

export const extractTypeKeys = (type: ts.Type): string[] => {
  return type.getProperties().map((symbol) => symbol.getName())
}

export const nullifyTypes = (type: string | null) => {
  if (
    type === 'void' ||
    type === 'undefined' ||
    type === 'unknown' ||
    type === 'any'
  ) {
    return null
  }
  return type
}

const isValidVariableName = (name: string) => {
  const regex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
  return regex.test(name)
}

export const getNamesAndTypes = (
  checker: ts.TypeChecker,
  typesMap: TypesMap,
  direction: 'Input' | 'Output',
  funcName: string,
  type: ts.Type
) => {
  const result: {
    names: Set<string>
    types: ts.Type[]
  } = {
    names: new Set(),
    types: [],
  }

  const { names, types } = resolveUnionTypes(checker, type)
  const firstName = names[0]
  if (names.length > 1 || (firstName && !isValidVariableName(firstName))) {
    const aliasType = names.join(' | ')
    const aliasName = `${funcName.charAt(0).toUpperCase()}${funcName.slice(1)}${direction}`

    result.names = new Set([aliasName])
    result.types = types

    const references = types
      .map((t) => resolveTypeImports(t, typesMap, true))
      .flat()
    typesMap.addCustomType(aliasName, aliasType, references)
  } else {
    const uniqueNames = names
      .map((name, i) => {
        const type = types[i]
        if (!type) {
          throw new Error('TODO: Expected a type here to match name')
        }
        if (isPrimitiveType(type)) {
          return name
        }
        return resolveTypeImports(type, typesMap, false)
      })
      .flat()
    result.names = new Set(uniqueNames)
    result.types = types
  }

  return {
    names: Array.from(result.names),
    types: result.types,
  }
}

export const isPrimitiveType = (type: ts.Type): boolean => {
  const primitiveFlags =
    ts.TypeFlags.Number |
    ts.TypeFlags.String |
    ts.TypeFlags.Boolean |
    ts.TypeFlags.BigInt |
    ts.TypeFlags.ESSymbol |
    ts.TypeFlags.Void |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Null |
    ts.TypeFlags.Any |
    ts.TypeFlags.Unknown

  return (type.flags & primitiveFlags) !== 0
}

export const resolveUnionTypes = (
  checker: ts.TypeChecker,
  type: ts.Type
): { types: ts.Type[]; names: string[] } => {
  const types: ts.Type[] = []
  const names: string[] = []

  // Check if it's a union type AND not part of an intersection
  if (type.isUnion() && !(type.flags & ts.TypeFlags.Intersection)) {
    for (const t of type.types) {
      const name = nullifyTypes(checker.typeToString(t))
      if (name) {
        types.push(t)
        names.push(name)
      }
    }
  } else {
    const name = nullifyTypes(checker.typeToString(type))
    if (name) {
      types.push(type)
      names.push(name)
    }
  }

  return { types, names }
}

export const resolveTypeImports = (
  type: ts.Type,
  resolvedTypes: TypesMap,
  isCustom: boolean
): string[] => {
  const types: string[] = []

  const visitType = (currentType: ts.Type) => {
    const symbol = currentType.aliasSymbol || currentType.getSymbol()

    if (symbol) {
      const declarations = symbol.getDeclarations()
      const declaration = declarations?.[0]
      if (declaration) {
        const sourceFile = declaration.getSourceFile()
        const path = sourceFile.fileName

        // Skip built-in utility types or TypeScript lib types
        if (
          !path.includes('node_modules/typescript') &&
          symbol.getName() !== '__type' &&
          !isPrimitiveType(currentType)
        ) {
          const originalName = symbol.getName()
          // Check if the type is already in the map
          let uniqueName = resolvedTypes.exists(originalName, path)
          if (!uniqueName) {
            if (isCustom) {
              uniqueName = resolvedTypes.addUniqueType(originalName, path)
            } else {
              resolvedTypes.addType(originalName, path)
              uniqueName = originalName
            }
          }
          types.push(uniqueName)
        }
      }
    }

    if (isCustom) {
      // Handle nested utility types like Partial, Pick, etc.
      if (currentType.aliasTypeArguments) {
        currentType.aliasTypeArguments.forEach(visitType)
      }

      // Handle intersections and unions
      if (currentType.isUnionOrIntersection()) {
        currentType.types.forEach(visitType)
      }

      // Handle object types with type arguments
      if (
        currentType.flags & ts.TypeFlags.Object &&
        (currentType as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
      ) {
        const typeRef = currentType as ts.TypeReference
        typeRef.typeArguments?.forEach(visitType)
      }
    }
  }

  visitType(type)
  return types
}

export const getPropertyAssignment = (
  obj: ts.ObjectLiteralExpression,
  name: string
) => {
  const property = obj.properties.find(
    (p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      ts.isIdentifier(p.name) &&
      p.name.text === name
  )
  if (!property) {
    console.error(`Missing property '${name}' in object`)
    return null
  }
  return property
}

export const getTypeArgumentsOfType = (
  checker: ts.TypeChecker,
  type: ts.Type
): readonly ts.Type[] | null => {
  if (type.isUnionOrIntersection()) {
    const types: ts.Type[] = []
    for (const subType of type.types) {
      const subTypeArgs = getTypeArgumentsOfType(checker, subType)
      if (subTypeArgs) {
        types.push(...subTypeArgs)
      }
    }
    return types.length > 0 ? types : null
  }

  // If the type is a TypeReference with typeArguments, return them
  if (
    type.flags & ts.TypeFlags.Object &&
    (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
  ) {
    const typeRef = type as ts.TypeReference
    if (typeRef.typeArguments && typeRef.typeArguments.length > 0) {
      return typeRef.typeArguments
    }
  }

  // If the type is an alias with aliasTypeArguments, return them
  if (type.aliasTypeArguments && type.aliasTypeArguments.length > 0) {
    return type.aliasTypeArguments as ts.Type[]
  }

  return null
}

export const getFunctionTypes = (
  checker: ts.TypeChecker,
  obj: ts.ObjectLiteralExpression,
  {
    typesMap,
    funcName,
    subFunctionName = funcName,
    inputIndex,
    outputIndex,
  }: {
    typesMap: TypesMap
    subFunctionName?: string
    funcName: string
    inputIndex: number
    outputIndex: number
  }
): FunctionTypes => {
  const result: FunctionTypes = {
    inputTypes: [],
    inputs: null,
    outputTypes: [],
    outputs: null,
  }

  const property = getPropertyAssignment(obj, subFunctionName)
  if (!property) {
    return result
  }

  let type: ts.Type | undefined

  // Handle shorthand property assignment
  if (ts.isShorthandPropertyAssignment(property)) {
    const symbol = checker.getShorthandAssignmentValueSymbol(property)
    if (symbol) {
      type = checker.getTypeOfSymbolAtLocation(symbol, property)
      if (funcName === 'func') {
        funcName = symbol.name
      }
    }
  }
  // Handle regular property assignment
  else if (ts.isPropertyAssignment(property)) {
    if (ts.isObjectLiteralExpression(property.initializer)) {
      return getFunctionTypes(checker, property.initializer, {
        typesMap,
        funcName,
        subFunctionName: 'func',
        inputIndex,
        outputIndex,
      })
    }

    if (property.initializer) {
      type = checker.getTypeAtLocation(property.initializer)
      if (funcName === 'func') {
        funcName = property.initializer.getText()
      }
    }
  }

  if (!type) {
    console.error(`Unable to resolve type for property '${funcName}'`)
    return result
  }

  // Access type arguments from TypeReference
  const typeArguments = getTypeArgumentsOfType(checker, type)

  if (!typeArguments || typeArguments.length === 0) {
    // This is the case for inline functions. In this case we would want to
    // get the types from the second argument of the function...
    console.error(
      `\x1b[31m• No generic type arguments found for ${funcName}. Support for inline functions is not yet implemented.\x1b[0m`
    )
    return result
  }

  if (inputIndex !== undefined && inputIndex < typeArguments.length) {
    const { names, types } = getNamesAndTypes(
      checker,
      typesMap,
      'Input',
      funcName,
      typeArguments[inputIndex]!
    )
    result.inputs = names
    result.inputTypes = types
  } else {
    console.log(`No input defined for ${funcName}`)
  }

  if (outputIndex !== undefined && outputIndex < typeArguments.length) {
    const { names, types } = getNamesAndTypes(
      checker,
      typesMap,
      'Output',
      funcName,
      typeArguments[outputIndex]!
    )
    result.outputs = names
    result.outputTypes = types
  } else {
    console.info(`No output defined for ${funcName}`)
  }

  return result
}

export const matchesFilters = (
  filters: InspectorFilters,
  params: { tags?: string[] },
  meta: { type: 'schedule' | 'http' | 'channel'; name: string }
) => {
  if (Object.keys(filters).length === 0 || filters.tags?.length === 0) {
    return true
  }

  if (filters.tags?.some((tag) => params.tags?.includes(tag))) {
    return true
  }

  console.debug(`⒡ Filtered: ${meta.type}:${meta.name}`)
  return false
}
