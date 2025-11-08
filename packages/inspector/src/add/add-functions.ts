import * as ts from 'typescript'
import { AddWiring } from '../types.js'
import { TypesMap } from '../types-map.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { FunctionServicesMeta, PikkuDocs } from '@pikku/core'
import { getPropertyValue } from '../utils/get-property-value.js'
import { resolveMiddleware } from '../utils/middleware.js'

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
  isCustom: boolean,
  checker: ts.TypeChecker
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
        // Skip enum members (but not the enum type itself)
        const isEnumMember = declaration && ts.isEnumMember(declaration)

        if (
          !path.includes('node_modules/typescript') &&
          symbol.getName() !== '__type' &&
          !isPrimitiveType(currentType) &&
          !isEnumMember
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

    // Always traverse type arguments for thorough type collection
    if (currentType.aliasTypeArguments) {
      currentType.aliasTypeArguments.forEach(visitType)
    }

    // Always handle intersections and unions
    if (currentType.isUnionOrIntersection()) {
      currentType.types.forEach(visitType)
    }

    // Always handle object types with type arguments
    if (
      currentType.flags & ts.TypeFlags.Object &&
      (currentType as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
    ) {
      const typeRef = currentType as ts.TypeReference
      typeRef.typeArguments?.forEach(visitType)
    }

    // Handle anonymous object types with enum properties (e.g., { userType: UserType })
    // Only traverse into enum property types to avoid over-importing other named types
    if (currentType.flags & ts.TypeFlags.Object) {
      const objectType = currentType as ts.ObjectType
      const typeSymbol = objectType.getSymbol()

      // Only traverse properties for anonymous object types (no symbol or __type symbol)
      // Skip named types, interfaces, and enums to avoid over-importing
      const isAnonymousObject = !typeSymbol || typeSymbol.getName() === '__type'

      if (isAnonymousObject) {
        const properties = objectType.getProperties()
        for (const prop of properties) {
          if (prop.valueDeclaration) {
            const propType = checker.getTypeOfSymbolAtLocation(
              prop,
              prop.valueDeclaration
            )
            if (propType) {
              visitType(propType)
            }
          }
        }
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
      names: [],
      types: [],
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
      .map((t) => resolveTypeImports(t, typesMap, true, checker))
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
      return resolveTypeImports(t, typesMap, false, checker)
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
export const addFunctions: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args, typeArguments } = node

  // only handle calls like pikkuFunc(...)
  if (!ts.isIdentifier(expression)) {
    return
  }

  // Match identifiers that contain both "pikku" and "func" (case insensitive)
  const pikkuFuncPattern = /pikku.*func/i
  if (!pikkuFuncPattern.test(expression.text)) {
    return
  }

  // only handle calls like pikkuFunc(...)
  if (!ts.isIdentifier(expression) || !expression.text.startsWith('pikku')) {
    return
  }

  if (args.length === 0) return

  const { pikkuFuncName, name, explicitName, exportedName } =
    extractFunctionName(node, checker, state.rootDir)

  let tags: string[] | undefined
  let expose: boolean | undefined
  let internal: boolean | undefined
  let docs: PikkuDocs | undefined
  let objectNode: ts.ObjectLiteralExpression | undefined

  // determine the actual handler expression:
  // either the `func` prop or the first argument directly
  let handlerNode: ts.Expression = args[0]!
  let isDirectFunction = true // Default to direct function format

  if (ts.isObjectLiteralExpression(handlerNode)) {
    isDirectFunction = false // This is object format with func property
    objectNode = handlerNode
    tags = (getPropertyValue(handlerNode, 'tags') as string[]) || undefined
    expose = getPropertyValue(handlerNode, 'expose') as boolean | undefined
    internal = getPropertyValue(handlerNode, 'internal') as boolean | undefined
    docs = getPropertyValue(handlerNode, 'docs') as PikkuDocs | undefined

    const fnProp = getPropertyAssignmentInitializer(
      handlerNode,
      'func',
      true,
      checker
    )
    if (
      !fnProp ||
      (!ts.isArrowFunction(fnProp) && !ts.isFunctionExpression(fnProp))
    ) {
      logger.error(`• No valid 'func' property found for ${pikkuFuncName}.`)
      // Create stub metadata to prevent "function not found" errors in wirings
      state.functions.meta[pikkuFuncName] = {
        pikkuFuncName,
        name,
        services: { optimized: false, services: [] },
        inputSchemaName: null,
        outputSchemaName: null,
        inputs: [],
        outputs: [],
        middleware: undefined,
      }
      return
    }
    handlerNode = fnProp
  }

  if (
    !ts.isArrowFunction(handlerNode) &&
    !ts.isFunctionExpression(handlerNode)
  ) {
    logger.error(`• Handler for ${name} is not a function.`)
    // Create stub metadata to prevent "function not found" errors in wirings
    state.functions.meta[pikkuFuncName] = {
      pikkuFuncName,
      name,
      services: { optimized: false, services: [] },
      inputSchemaName: null,
      outputSchemaName: null,
      inputs: [],
      outputs: [],
      middleware: undefined,
    }
    return
  }

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
    } else if (ts.isIdentifier(firstParam.name)) {
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
    name,
    genericTypes[0]
  )
  // if (inputTypes.length === 0) {
  //   logger.debug(
  //     `\x1b[31m• Unknown input type for '${name}', assuming void.\x1b[0m`
  //   )
  // }

  // --- Output Extraction ---
  let outputNames: string[] = []
  if (genericTypes.length >= 2) {
    outputNames = getNamesAndTypes(
      checker,
      state.functions.typesMap,
      'Output',
      name,
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
        pikkuFuncName,
        unwrapped
      ).names
    }
  }

  if (inputNames.length > 1) {
    logger.warn(
      'More than one input type detected, only the first one will be used as a schema.'
    )
  }

  // --- resolve middleware ---
  const middleware = objectNode
    ? resolveMiddleware(state, objectNode, tags, checker)
    : undefined

  state.functions.meta[pikkuFuncName] = {
    pikkuFuncName,
    name,
    services,
    inputSchemaName: inputNames[0] ?? null,
    outputSchemaName: outputNames[0] ?? null,
    inputs: inputNames.filter((n) => n !== 'void') ?? null,
    outputs: outputNames.filter((n) => n !== 'void') ?? null,
    expose: expose || undefined,
    internal: internal || undefined,
    tags: tags || undefined,
    docs: docs || undefined,
    isDirectFunction,
    middleware,
  }

  // Store the input type for later use
  if (inputTypes.length > 0) {
    state.typesLookup.set(pikkuFuncName, inputTypes)
  }

  // Store function file location for wiring generation
  if (exportedName) {
    state.functions.files.set(pikkuFuncName, {
      path: node.getSourceFile().fileName,
      exportedName,
    })
  }

  if (exportedName || explicitName) {
    if (!exportedName) {
      logger.error(
        `• Function with explicit name '${name}' is not exported, this is not allowed.`
      )
      return
    }

    // Mark internal functions as invoked to force bundling
    if (internal) {
      state.rpc.invokedFunctions.add(pikkuFuncName)
    }

    if (expose) {
      state.rpc.exposedMeta[name] = pikkuFuncName
      state.rpc.exposedFiles.set(name, {
        path: node.getSourceFile().fileName,
        exportedName,
      })
      // Track exposed RPC function for service aggregation
      state.serviceAggregation.usedFunctions.add(pikkuFuncName)
    }

    // We add it to internal meta to allow autocomplete for everything
    state.rpc.internalMeta[name] = pikkuFuncName

    // But we only import the actual function if it's actually invoked to keep
    // bundle size down
    if (state.rpc.invokedFunctions.has(pikkuFuncName) || expose || internal) {
      state.rpc.internalFiles.set(name, {
        path: node.getSourceFile().fileName,
        exportedName,
      })
    }
  }
}
