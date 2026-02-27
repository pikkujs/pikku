import * as ts from 'typescript'
import type { AddWiring, SchemaRef } from '../types.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'
import type { TypesMap } from '../types-map.js'
import {
  extractFunctionName,
  funcIdToTypeName,
} from '../utils/extract-function-name.js'
import { extractFunctionNode } from '../utils/extract-function-node.js'
import { extractUsedWires } from '../utils/extract-services.js'
import type { FunctionServicesMeta } from '@pikku/core'
import { formatVersionedId } from '@pikku/core'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { resolvePermissions } from '../utils/permissions.js'
import { extractWireNames } from '../utils/post-process.js'
import { ErrorCode } from '../error-codes.js'
import type { NodeType } from '@pikku/core/node'

const isValidVariableName = (name: string) => {
  const regex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
  return regex.test(name)
}

const nullifyTypes = (type: string | null) => {
  if (
    type === 'void' ||
    type === 'undefined' ||
    type === 'unknown' ||
    type === 'any' ||
    type === 'null'
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
      const name = nullifyTypes(
        checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation)
      )
      if (name) {
        types.push(t)
        names.push(name)
      }
    }
  } else {
    const name = nullifyTypes(
      checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
    )
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

  // 1) Handle an explicit void (or undefined or null) type up front
  if (type.flags & (ts.TypeFlags.VoidLike | ts.TypeFlags.Null)) {
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
    const aliasName = funcIdToTypeName(funcName) + direction

    // record the alias in your TypesMap
    const references = rawTypes.flatMap((t) =>
      resolveTypeImports(t, typesMap, true, checker)
    )

    typesMap.addCustomType(aliasName, aliasType, references)

    return {
      names: [aliasName],
      types: rawTypes,
    }
  }

  // 4) Single, valid name → inline it
  const uniqueNames = rawNames.flatMap((name, i) => {
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
export const addFunctions: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
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

  let { pikkuFuncId, name, explicitName, exportedName } = extractFunctionName(
    node,
    checker,
    state.rootDir
  )

  if (!pikkuFuncId || pikkuFuncId.startsWith('__temp_')) {
    return
  }

  let title: string | undefined
  let tags: string[] | undefined
  let summary: string | undefined
  let description: string | undefined
  let errors: string[] | undefined
  let expose: boolean | undefined
  let remote: boolean | undefined
  let mcp: boolean | undefined
  let readonly_: boolean | undefined
  let requiresApproval: boolean | undefined
  let version: number | undefined
  let objectNode: ts.ObjectLiteralExpression | undefined
  let nodeDisplayName: string | null = null
  let nodeCategory: string | null = null
  let nodeType: NodeType | null = null
  let nodeErrorOutput: boolean | null = null

  // Extract the function node using shared utility
  const firstArg = args[0]!
  const {
    funcNode: handlerNode,
    resolvedFunc,
    isDirectFunction,
  } = extractFunctionNode(firstArg, checker)

  // Variables to hold schema references if provided
  let inputSchemaRef: SchemaRef | null = null
  let outputSchemaRef: SchemaRef | null = null

  // Helper to resolve schema identifier to its actual source file and detect vendor.
  // Logs a fatal error and returns null if vendor cannot be determined.
  const resolveSchemaRef = (
    identifier: ts.Identifier,
    context: string
  ): SchemaRef | null => {
    const symbol = checker.getSymbolAtLocation(identifier)
    if (!symbol) return null

    const decl = symbol.valueDeclaration || symbol.declarations?.[0]
    if (!decl) return null

    let sourceFile: string

    // If it's an import specifier, resolve the aliased symbol to get the actual source
    if (ts.isImportSpecifier(decl)) {
      const aliasedSymbol = checker.getAliasedSymbol(symbol)
      if (aliasedSymbol) {
        const aliasedDecl =
          aliasedSymbol.valueDeclaration || aliasedSymbol.declarations?.[0]
        if (aliasedDecl) {
          sourceFile = aliasedDecl.getSourceFile().fileName
        } else {
          return null
        }
      } else {
        return null
      }
    } else {
      sourceFile = decl.getSourceFile().fileName
    }

    const vendor = detectSchemaVendorOrError(
      identifier,
      checker,
      logger,
      context,
      sourceFile
    )
    if (!vendor) return null

    return {
      variableName: identifier.text,
      sourceFile,
      vendor,
    }
  }

  // Extract config properties if using object form
  if (ts.isObjectLiteralExpression(firstArg)) {
    objectNode = firstArg
    const metadata = getCommonWireMetaData(firstArg, 'Function', name, logger)
    if (metadata.disabled) return
    title = metadata.title
    tags = metadata.tags
    summary = metadata.summary
    description = metadata.description
    errors = metadata.errors
    expose = getPropertyValue(firstArg, 'expose') as boolean | undefined
    remote = getPropertyValue(firstArg, 'remote') as boolean | undefined
    mcp = getPropertyValue(firstArg, 'mcp') as boolean | undefined
    readonly_ = getPropertyValue(firstArg, 'readonly') as boolean | undefined
    requiresApproval = getPropertyValue(firstArg, 'requiresApproval') as
      | boolean
      | undefined

    const versionRaw = getPropertyValue(firstArg, 'version')
    if (versionRaw !== null && versionRaw !== undefined) {
      const parsed = Number(versionRaw)
      if (Number.isInteger(parsed) && parsed >= 1) {
        version = parsed
      }
    }

    // Extract node config from nested object
    for (const prop of firstArg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'node' &&
        ts.isObjectLiteralExpression(prop.initializer)
      ) {
        const nodeObj = prop.initializer
        nodeDisplayName = getPropertyValue(nodeObj, 'displayName') as
          | string
          | null
        nodeCategory = getPropertyValue(nodeObj, 'category') as string | null
        nodeType = getPropertyValue(nodeObj, 'type') as NodeType | null
        nodeErrorOutput = getPropertyValue(nodeObj, 'errorOutput') as
          | boolean
          | null

        if (!nodeDisplayName) {
          logger.critical(
            ErrorCode.MISSING_NAME,
            `Function '${name}' node config is missing the required 'displayName' property.`
          )
        }
        if (!nodeCategory) {
          logger.critical(
            ErrorCode.MISSING_NAME,
            `Function '${name}' node config is missing the required 'category' property.`
          )
        }
        if (!nodeType) {
          logger.critical(
            ErrorCode.MISSING_NAME,
            `Function '${name}' node config is missing the required 'type' property.`
          )
        } else if (!['trigger', 'action', 'end'].includes(nodeType)) {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `Function '${name}' node config has invalid type '${nodeType}'. Must be 'trigger', 'action', or 'end'.`
          )
        }
        break
      }
    }

    // Extract schema variable names from input/output properties
    for (const prop of firstArg.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text
        if (propName === 'input' || propName === 'output') {
          if (ts.isIdentifier(prop.initializer)) {
            // Good - it's a variable reference, resolve its actual source file and vendor
            const context = `Function '${name}' ${propName}`
            const ref = resolveSchemaRef(prop.initializer, context)
            if (ref) {
              if (propName === 'input') {
                inputSchemaRef = ref
              } else {
                outputSchemaRef = ref
              }
            }
          } else if (ts.isCallExpression(prop.initializer)) {
            // Bad - it's an inline expression
            const schemaName = `${funcIdToTypeName(name)}${propName.charAt(0).toUpperCase() + propName.slice(1)}`
            logger.critical(
              ErrorCode.INLINE_SCHEMA,
              `Inline schemas are not supported for '${propName}' in '${name}'.\n` +
                `  Extract to an exported variable:\n` +
                `    export const ${schemaName} = ${prop.initializer.getText()}\n` +
                `  Then use: ${propName}: ${schemaName}`
            )
          }
        }
      }
    }
  }

  if (version !== undefined) {
    const baseName = explicitName || exportedName || pikkuFuncId
    pikkuFuncId = formatVersionedId(baseName, version)
  }

  const isMCPToolFunc = expression.text === 'pikkuMCPToolFunc'
  const mcpEnabled = mcp || isMCPToolFunc

  // Pick the handler: use resolvedFunc when it exists and is a function, otherwise fall back to handlerNode
  const handler =
    resolvedFunc &&
    (ts.isArrowFunction(resolvedFunc) || ts.isFunctionExpression(resolvedFunc))
      ? resolvedFunc
      : handlerNode

  // Validate that we got a valid function
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) {
    logger.error(`• No valid 'func' property found for ${pikkuFuncId}.`)
    // Create stub metadata to prevent "function not found" errors in wirings
    state.functions.meta[pikkuFuncId] = {
      pikkuFuncId,
      functionType: 'user',
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

  const firstParam = handler.parameters[0]
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

  const wires = extractUsedWires(handler, 2)

  // --- Generics → ts.Type[], unwrapped from Promise ---
  const genericTypes: ts.Type[] = (typeArguments ?? [])
    .map((tn) => checker.getTypeFromTypeNode(tn))
    .map((t) => unwrapPromise(checker, t))

  const capitalizedName = funcIdToTypeName(name)

  // --- Input Extraction ---
  let inputNames: string[] = []
  let inputTypes: ts.Type[] = []

  if (inputSchemaRef) {
    const schemaName = `${capitalizedName}Input`
    inputNames = [schemaName]
    state.schemaLookup.set(schemaName, inputSchemaRef)
    state.functions.typesMap.addCustomType(schemaName, 'unknown', [])
  } else if (genericTypes.length >= 1 && genericTypes[0]) {
    // Fall back to extracting from generic type arguments
    const result = getNamesAndTypes(
      checker,
      state.functions.typesMap,
      'Input',
      name,
      genericTypes[0]
    )
    inputNames = result.names
    inputTypes = result.types
  } else {
    // Fall back to extracting from the function's second parameter type
    const secondParam = handler.parameters[1]
    if (secondParam) {
      const paramType = checker.getTypeAtLocation(secondParam)
      const result = getNamesAndTypes(
        checker,
        state.functions.typesMap,
        'Input',
        pikkuFuncId,
        paramType
      )
      inputNames = result.names
      inputTypes = result.types
    }
  }

  // --- Output Extraction ---
  let outputNames: string[] = []

  if (outputSchemaRef) {
    const schemaName = `${capitalizedName}Output`
    outputNames = [schemaName]
    state.schemaLookup.set(schemaName, outputSchemaRef)
    state.functions.typesMap.addCustomType(schemaName, 'unknown', [])
  } else if (genericTypes.length >= 2) {
    outputNames = getNamesAndTypes(
      checker,
      state.functions.typesMap,
      'Output',
      name,
      genericTypes[1]
    ).names
  } else {
    const sig = checker.getSignatureFromDeclaration(handler)
    if (sig) {
      const rawRet = checker.getReturnTypeOfSignature(sig)
      const unwrapped = unwrapPromise(checker, rawRet)
      outputNames = getNamesAndTypes(
        checker,
        state.functions.typesMap,
        'Output',
        pikkuFuncId,
        unwrapped
      ).names
    }
  }

  const mcpOutputTypes: Record<string, string> = {
    pikkuMCPResourceFunc: 'MCPResourceResponse',
    pikkuMCPToolFunc: 'MCPToolResponse',
    pikkuMCPPromptFunc: 'MCPPromptResponse',
  }
  const mcpOutputType = mcpOutputTypes[expression.text]
  if (mcpOutputType && outputNames[0] !== mcpOutputType) {
    let resolved = false
    const rawSymbol = checker.getSymbolAtLocation(expression)
    const funcSymbol =
      rawSymbol && rawSymbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(rawSymbol)
        : rawSymbol
    const funcDecls = funcSymbol?.getDeclarations() || []
    for (const funcDecl of funcDecls) {
      if (resolved) break
      const mcpTypeSymbol = checker.resolveName(
        mcpOutputType,
        funcDecl,
        ts.SymbolFlags.Type,
        false
      )
      if (mcpTypeSymbol) {
        const aliased =
          mcpTypeSymbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(mcpTypeSymbol)
            : mcpTypeSymbol
        const typeDecl = aliased?.getDeclarations()?.[0]
        if (typeDecl) {
          const path = typeDecl.getSourceFile().fileName
          if (!state.functions.typesMap.exists(mcpOutputType, path)) {
            state.functions.typesMap.addType(mcpOutputType, path)
          }
          resolved = true
        }
      }
    }
    if (!resolved) {
      state.functions.typesMap.addCustomType(mcpOutputType, mcpOutputType, [])
    }
    outputNames = [mcpOutputType]
  }

  if (inputNames.length > 1) {
    logger.warn(
      'More than one input type detected, only the first one will be used as a schema.'
    )
  }

  // Store the input type for later use
  if (inputTypes.length > 0) {
    state.typesLookup.set(pikkuFuncId, inputTypes)
  }

  // --- resolve middleware ---
  let middleware = objectNode
    ? resolveMiddleware(state, objectNode, tags, checker)
    : undefined

  // --- resolve permissions ---
  let permissions = objectNode
    ? resolvePermissions(state, objectNode, tags, checker)
    : undefined

  if (options.tags?.length) {
    tags = [...new Set([...(tags || []), ...options.tags])]
    const tagEntries = options.tags.map((tag) => ({
      type: 'tag' as const,
      tag,
    }))
    const existingMiddlewareTags = new Set(
      (middleware || [])
        .filter((m) => m.type === 'tag')
        .map((m) => (m as any).tag)
    )
    const newMiddleware = tagEntries.filter(
      (e) => !existingMiddlewareTags.has(e.tag)
    )
    if (newMiddleware.length > 0) {
      middleware = [...(middleware || []), ...newMiddleware]
    }
    const existingPermissionTags = new Set(
      (permissions || [])
        .filter((p) => p.type === 'tag')
        .map((p) => (p as any).tag)
    )
    const newPermissions = tagEntries.filter(
      (e) => !existingPermissionTags.has(e.tag)
    )
    if (newPermissions.length > 0) {
      permissions = [...(permissions || []), ...newPermissions]
    }
  }

  const sessionless = expression.text !== 'pikkuFunc'

  state.functions.meta[pikkuFuncId] = {
    pikkuFuncId,
    functionType: 'user',
    funcWrapper: expression.text,
    sessionless,
    name,
    services,
    wires: wires.wires.length > 0 || !wires.optimized ? wires : undefined,
    inputSchemaName: inputNames[0] ?? null,
    outputSchemaName: outputNames[0] ?? null,
    inputs: inputNames.filter((n) => n !== 'void') ?? null,
    outputs: outputNames.filter((n) => n !== 'void') ?? null,
    expose: expose || undefined,
    remote: remote || undefined,
    mcp: mcpEnabled || undefined,
    readonly: readonly_ || undefined,
    requiresApproval: requiresApproval || undefined,
    version,
    title,
    tags: tags || undefined,
    summary,
    description,
    errors,
    middleware,
    permissions,
    isDirectFunction,
  }

  // Populate node metadata if node config is present
  if (nodeDisplayName && nodeCategory && nodeType) {
    state.nodes.files.add(node.getSourceFile().fileName)
    state.nodes.meta[pikkuFuncId] = {
      name: pikkuFuncId,
      displayName: nodeDisplayName,
      category: nodeCategory,
      type: nodeType,
      rpc: pikkuFuncId,
      description,
      errorOutput: nodeErrorOutput ?? false,
      inputSchemaName: inputNames[0] ?? null,
      outputSchemaName: outputNames[0] ?? null,
      tags,
    }
  }

  if (mcpEnabled) {
    if (!description) {
      logger.critical(
        ErrorCode.MISSING_DESCRIPTION,
        `MCP tool '${name}' is missing a description.`
      )
      return
    }
    state.mcpEndpoints.files.add(node.getSourceFile().fileName)
    state.mcpEndpoints.toolsMeta[name] = {
      pikkuFuncId,
      name,
      title: title || undefined,
      description,
      summary,
      errors,
      tags,
      inputSchema: inputNames[0] ?? null,
      outputSchema: outputNames[0] ?? null,
      middleware,
      permissions,
    }
    state.serviceAggregation.usedFunctions.add(pikkuFuncId)
    extractWireNames(middleware).forEach((n) =>
      state.serviceAggregation.usedMiddleware.add(n)
    )
    extractWireNames(permissions).forEach((n) =>
      state.serviceAggregation.usedPermissions.add(n)
    )
  }

  // Workflow functions don't get registered as RPC functions,
  // they are their own type handled by add-workflow
  if (expression.text.includes('Workflow')) {
    return
  }

  // Trigger and channel connect/disconnect functions are not callable via RPC
  const nonRPCPatterns = [
    /Trigger/i,
    /ChannelConnection/i,
    /ChannelDisconnection/i,
  ]
  if (nonRPCPatterns.some((pattern) => pattern.test(expression.text))) {
    return
  }

  // Store function file location for wiring generation
  if (exportedName) {
    state.functions.files.set(pikkuFuncId, {
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

    if (remote) {
      state.rpc.invokedFunctions.add(pikkuFuncId)
    }

    if (expose) {
      state.rpc.exposedMeta[name] = pikkuFuncId
      state.rpc.exposedFiles.set(name, {
        path: node.getSourceFile().fileName,
        exportedName,
      })
      // Track exposed RPC function for service aggregation
      state.serviceAggregation.usedFunctions.add(pikkuFuncId)
    }

    // We add it to internal meta to allow autocomplete for everything
    state.rpc.internalMeta[name] = pikkuFuncId

    if (version !== undefined) {
      state.rpc.internalMeta[pikkuFuncId] = pikkuFuncId
      state.rpc.invokedFunctions.add(pikkuFuncId)
    }

    // But we only import the actual function if it's actually invoked to keep
    // bundle size down
    if (
      state.rpc.invokedFunctions.has(pikkuFuncId) ||
      expose ||
      remote ||
      mcpEnabled
    ) {
      state.rpc.internalFiles.set(pikkuFuncId, {
        path: node.getSourceFile().fileName,
        exportedName,
      })
    }
  }
}
