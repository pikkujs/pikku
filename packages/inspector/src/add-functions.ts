import * as ts from 'typescript'
import { InspectorState, InspectorFilters } from './types.js'
import { TypesMap } from './types-map.js'
import { extractFunctionName } from './utils.js'
import { FunctionServicesMeta } from '@pikku/core'

const isValidVariableName = (name: string) => {
  const regex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
  return regex.test(name)
}

const nullifyTypes = (type: string | null) => {
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

const resolveTypeImports = (
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

const resolveUnionTypes = (
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

const getNamesAndTypes = (
  checker: ts.TypeChecker,
  typesMap: TypesMap,
  direction: 'Input' | 'Output',
  funcName: string,
  type?: ts.Type
) => {
  if (!type) {
    return { names: [], types: [] }
  }

  // 1) Handle an explicit void (or undefined) type up front
  if (type.flags & ts.TypeFlags.VoidLike) {
    return {
      names: ['void'],
      types: [type],
    }
  }

  // 2) For unions, resolve all member names/types
  const { names: rawNames, types: rawTypes } = resolveUnionTypes(checker, type)

  // If the union is exactly [void], we'd have caught it above.
  // If it's e.g. [string, void], rawNames should already include 'void'.

  // 3) If multiple names or the single name isn't a valid identifier,
  //    we emit an alias type.
  const firstName = rawNames[0]
  if (rawNames.length > 1 || (firstName && !isValidVariableName(firstName))) {
    const aliasType = rawNames.join(' | ')
    const aliasName =
      funcName.charAt(0).toUpperCase() + funcName.slice(1) + direction

    // record the alias in your TypesMap
    const references = rawTypes
      .map((t) => resolveTypeImports(t, typesMap, true))
      .flat()

    typesMap.addCustomType(aliasName, aliasType, references)

    return {
      names: [aliasName],
      types: rawTypes,
    }
  }

  // 4) Single, valid name → inline it
  const uniqueNames = rawNames
    .map((name, i) => {
      const t = rawTypes[i]
      if (!t) {
        throw new Error(`Expected type for name "${name}" in ${funcName}`)
      }
      if (isPrimitiveType(t)) {
        return name
      }
      // non-primitive: import/alias it inline
      return resolveTypeImports(t, typesMap, false)
    })
    .flat()

  return {
    names: uniqueNames,
    types: rawTypes,
  }
}

const isPrimitiveType = (type: ts.Type): boolean => {
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
    ts.TypeFlags.Unknown |
    ts.TypeFlags.VoidLike

  return (type.flags & primitiveFlags) !== 0
}

/**
 * If `type` is a `Promise<T>`, return `T`, otherwise return `type` itself.
 */
function unwrapPromise(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  if (!type?.symbol) return type

  const isPromise =
    type.symbol.name === 'Promise' &&
    checker.getFullyQualifiedName(type.symbol).includes('Promise')

  // aliasTypeArguments covers most Promise<T> cases
  if (isPromise && type.aliasTypeArguments?.length === 1) {
    return type.aliasTypeArguments[0]!
  }

  // fallback for raw TypeReference
  if (isPromise && (type as ts.TypeReference).typeArguments?.length === 1) {
    return (type as ts.TypeReference).typeArguments![0]!
  }

  return type
}

/**
 * Inspect pikkuFunc calls, extract input/output and first-arg destructuring,
 * then push into state.functions.meta.
 */
export function addFunctions(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args, typeArguments } = node

  // only handle calls like pikkuFunc(...)
  if (!ts.isIdentifier(expression) || !expression.text.startsWith('pikku')) {
    return
  }
  if (args.length === 0) return

  // figure out the function name
  const funcName = extractFunctionName(node)
  if (!funcName) {
    console.error('Couldn’t determine function name—skipping.')
    return
  }

  // determine the actual handler expression:
  // either the `func` prop or the first argument directly
  let handlerNode: ts.Expression = args[0]!
  if (ts.isObjectLiteralExpression(handlerNode)) {
    const fnProp = handlerNode.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'func'
    )
    if (
      !fnProp ||
      (!ts.isArrowFunction(fnProp.initializer) &&
        !ts.isFunctionExpression(fnProp.initializer))
    ) {
      console.error(`• No valid 'func' property found for ${funcName}.`)
      return
    }
    handlerNode = fnProp.initializer
  }
  if (
    !ts.isArrowFunction(handlerNode) &&
    !ts.isFunctionExpression(handlerNode)
  ) {
    console.error(`• Handler for ${funcName} is not a function.`)
    return
  }

  // --- NEW: Extract first-arg destructuring names ---
  const services: FunctionServicesMeta = {
    optimized: true,
    services: [],
  }

  const firstParam = handlerNode.parameters[0]
  if (firstParam) {
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const elem of firstParam.name.elements) {
        const original =
          elem.propertyName && ts.isIdentifier(elem.propertyName)
            ? elem.propertyName.text
            : ts.isIdentifier(elem.name)
              ? elem.name.text
              : undefined
        if (original) {
          services.services.push(original)
        }
      }
    } else if (
      ts.isIdentifier(firstParam.name) &&
      !firstParam.name.text.startsWith('_')
    ) {
      services.optimized = false
    }
  }

  // --- Generics → ts.Type[], unwrapped from Promise ---
  const genericTypes: ts.Type[] = (typeArguments ?? [])
    .map((tn) => checker.getTypeFromTypeNode(tn))
    .map((t) => unwrapPromise(checker, t))

  // --- Input Extraction ---
  let { names: inputNames, types: inputTypes } = getNamesAndTypes(
    checker,
    state.functions.typesMap,
    'Input',
    funcName,
    genericTypes[0]
  )
  if (inputTypes.length === 0) {
    console.error(
      `\x1b[31m• Unknown input type for ${funcName}, assuming void.\x1b[0m`
    )
  }

  // --- Output Extraction ---
  let outputNames: string[] = []
  if (genericTypes.length >= 2) {
    outputNames = getNamesAndTypes(
      checker,
      state.functions.typesMap,
      'Output',
      funcName,
      genericTypes[1]
    ).names
  } else {
    const sig = checker.getSignatureFromDeclaration(handlerNode)
    if (sig) {
      const rawRet = checker.getReturnTypeOfSignature(sig)
      const unwrapped = unwrapPromise(checker, rawRet)
      outputNames = getNamesAndTypes(
        checker,
        state.functions.typesMap,
        'Output',
        funcName,
        unwrapped
      ).names
    }
  }

  // --- Record metadata ---
  state.functions.files.add(node.getSourceFile().fileName)
  state.functions.meta[funcName] = {
    name: funcName,
    services,
    inputs: inputNames.filter((n) => n !== 'void') ?? null,
    outputs: outputNames.filter((n) => n !== 'void') ?? null,
  }
}
