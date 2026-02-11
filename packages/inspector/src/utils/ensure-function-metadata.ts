import * as ts from 'typescript'
import { InspectorState } from '../types.js'
import { funcIdToTypeName } from './extract-function-name.js'
import { getCommonWireMetaData } from './get-property-value.js'
import { resolveMiddleware } from './middleware.js'
import { resolvePermissions } from './permissions.js'

function isVoidLike(type: ts.Type): boolean {
  return !!(
    type.flags &
    (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.VoidLike)
  )
}

function isPromiseOfVoid(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (!type?.symbol) return false
  const isPromise =
    type.symbol.name === 'Promise' &&
    checker.getFullyQualifiedName(type.symbol).includes('Promise')
  if (!isPromise) return false
  const inner =
    type.aliasTypeArguments?.[0] ??
    (type as ts.TypeReference).typeArguments?.[0]
  return !!inner && isVoidLike(inner)
}

function unwrapPromise(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  if (type.isUnion()) {
    const nonVoid = type.types.filter(
      (t) => !isVoidLike(t) && !isPromiseOfVoid(checker, t)
    )
    if (nonVoid.length === 1) {
      return unwrapPromise(checker, nonVoid[0]!)
    }
    if (nonVoid.length > 1) {
      return unwrapPromise(checker, nonVoid[0]!)
    }
    return type
  }
  if (!type?.symbol) return type
  const isPromise =
    type.symbol.name === 'Promise' &&
    checker.getFullyQualifiedName(type.symbol).includes('Promise')
  if (isPromise && type.aliasTypeArguments?.length === 1) {
    return type.aliasTypeArguments[0]!
  }
  if (isPromise && (type as ts.TypeReference).typeArguments?.length === 1) {
    return (type as ts.TypeReference).typeArguments![0]!
  }
  return type
}

function resolveTypeName(
  checker: ts.TypeChecker,
  type: ts.Type,
  state: InspectorState,
  funcName: string,
  direction: 'Input' | 'Output'
): string | null {
  if (type.flags & (ts.TypeFlags.VoidLike | ts.TypeFlags.Null)) return null

  const typeStr = checker.typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.NoTruncation
  )
  if (
    !typeStr ||
    typeStr === 'void' ||
    typeStr === 'undefined' ||
    typeStr === 'null'
  )
    return null

  const isSimpleName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(typeStr)
  if (isSimpleName) {
    const symbol = type.aliasSymbol || type.getSymbol()
    if (symbol) {
      const decl = symbol.getDeclarations()?.[0]
      if (decl) {
        const path = decl.getSourceFile().fileName
        if (!state.functions.typesMap.exists(typeStr, path)) {
          state.functions.typesMap.addType(typeStr, path)
        }
      }
    }
    return typeStr
  }

  const aliasName = funcIdToTypeName(funcName) + direction
  state.functions.typesMap.addCustomType(aliasName, typeStr, [])
  return aliasName
}

function getFirstCallSignature(type: ts.Type): ts.Signature | undefined {
  const sigs = type.getCallSignatures()
  if (sigs.length > 0) return sigs[0]
  if (type.isUnion()) {
    for (const member of type.types) {
      const memberSigs = member.getCallSignatures()
      if (memberSigs.length > 0) return memberSigs[0]
    }
  }
  return undefined
}

function resolveFromConfigTypeArgs(
  state: InspectorState,
  pikkuFuncId: string,
  configType: ts.Type,
  checker: ts.TypeChecker,
  meta: NonNullable<InspectorState['functions']['meta'][string]>
): void {
  const typeArgs =
    configType.aliasTypeArguments ??
    (configType as ts.TypeReference).typeArguments
  if (!typeArgs || typeArgs.length < 2) return

  const inputType = typeArgs[0]!
  const outputType = typeArgs[1]!

  if (!meta.inputs || meta.inputs.length === 0) {
    const inputName = resolveTypeName(
      checker,
      inputType,
      state,
      pikkuFuncId,
      'Input'
    )
    if (inputName) {
      meta.inputs = [inputName]
      meta.inputSchemaName = inputName
    }
  }

  if (!meta.outputs || meta.outputs.length === 0) {
    const resolvedOutput = unwrapPromise(checker, outputType)
    const outputName = resolveTypeName(
      checker,
      resolvedOutput,
      state,
      pikkuFuncId,
      'Output'
    )
    if (outputName) {
      meta.outputs = [outputName]
      meta.outputSchemaName = outputName
    }
  }
}

function resolveFuncConfigTypes(
  state: InspectorState,
  pikkuFuncId: string,
  funcInitializer: ts.Node,
  checker: ts.TypeChecker
): void {
  const meta = state.functions.meta[pikkuFuncId]
  if (!meta || (meta.inputs && meta.inputs.length > 0)) return

  const configType = checker.getTypeAtLocation(funcInitializer)
  const funcProp = configType.getProperty('func')
  if (!funcProp) return

  const funcType = checker.getTypeOfSymbolAtLocation(funcProp, funcInitializer)
  const sig = getFirstCallSignature(funcType)
  if (!sig) return
  const params = sig.getParameters()
  if (params.length >= 2) {
    const inputType = checker.getTypeOfSymbolAtLocation(
      params[1]!,
      funcInitializer
    )
    const inputName = resolveTypeName(
      checker,
      inputType,
      state,
      pikkuFuncId,
      'Input'
    )
    if (inputName) {
      meta.inputs = [inputName]
      meta.inputSchemaName = inputName
    }
  }

  const rawReturnType = checker.getReturnTypeOfSignature(sig)
  const outputType = unwrapPromise(checker, rawReturnType)
  const outputName = resolveTypeName(
    checker,
    outputType,
    state,
    pikkuFuncId,
    'Output'
  )
  if (outputName) {
    meta.outputs = [outputName]
    meta.outputSchemaName = outputName
  }

  resolveFromConfigTypeArgs(state, pikkuFuncId, configType, checker, meta)
}

function resolveToPikkuFuncCall(
  node: ts.Node,
  checker: ts.TypeChecker
): ts.CallExpression | null {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text.startsWith('pikku')
  ) {
    return node
  }

  if (ts.isIdentifier(node)) {
    const sym = checker.getSymbolAtLocation(node)
    if (sym) {
      let resolved = sym
      if (resolved.flags & ts.SymbolFlags.Alias) {
        resolved = checker.getAliasedSymbol(resolved) ?? resolved
      }
      const decl = resolved.declarations?.[0]
      if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
        return resolveToPikkuFuncCall(decl.initializer, checker)
      }
    }
  }

  return null
}

/**
 * Ensures that function metadata exists for a given pikkuFuncId.
 * Creates stub metadata if it doesn't exist (useful for inline functions).
 * When funcInitializer and checker are provided, resolves types and
 * extracts tags/middleware/permissions from the pikkuFunc() config.
 */
export function ensureFunctionMetadata(
  state: InspectorState,
  pikkuFuncId: string,
  fallbackName?: string,
  funcInitializer?: ts.Node,
  checker?: ts.TypeChecker,
  isHelper?: boolean
): void {
  if (!state.functions.meta[pikkuFuncId]) {
    state.functions.meta[pikkuFuncId] = {
      pikkuFuncId,
      functionType: isHelper ? 'helper' : 'inline',
      name: fallbackName || pikkuFuncId,
      services: { optimized: false, services: [] },
      inputSchemaName: null,
      outputSchemaName: null,
      inputs: [],
      outputs: [],
      middleware: undefined,
    }
  }

  const meta = state.functions.meta[pikkuFuncId]!

  if (funcInitializer && checker) {
    let pikkuFuncCall: ts.CallExpression | null = null

    if (ts.isCallExpression(funcInitializer)) {
      pikkuFuncCall = funcInitializer
      resolveFuncConfigTypes(state, pikkuFuncId, pikkuFuncCall, checker)
      if (!state.typesLookup.has(pikkuFuncId)) {
        populateTypesLookup(state, pikkuFuncId, pikkuFuncCall, checker)
      }
    } else {
      pikkuFuncCall = resolveToPikkuFuncCall(funcInitializer, checker)
    }

    if (pikkuFuncCall) {
      const firstArg = pikkuFuncCall.arguments[0]
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        if (!meta.tags) {
          const { tags } = getCommonWireMetaData(
            firstArg,
            'Function',
            fallbackName || pikkuFuncId
          )
          if (tags) {
            meta.tags = tags
          }
        }
        if (!meta.middleware) {
          meta.middleware = resolveMiddleware(
            state,
            firstArg,
            meta.tags,
            checker
          )
        }
        if (!meta.permissions) {
          meta.permissions = resolvePermissions(
            state,
            firstArg,
            meta.tags,
            checker
          )
        }
      }
    }
  }
}

function populateTypesLookup(
  state: InspectorState,
  pikkuFuncId: string,
  funcInitializer: ts.CallExpression,
  checker: ts.TypeChecker
): void {
  const typeArgs = funcInitializer.typeArguments
  if (typeArgs && typeArgs.length >= 1) {
    const inputType = checker.getTypeFromTypeNode(typeArgs[0]!)
    state.typesLookup.set(pikkuFuncId, [inputType])
    return
  }

  const configType = checker.getTypeAtLocation(funcInitializer)
  const funcProp = configType.getProperty('func')
  if (!funcProp) return

  const funcType = checker.getTypeOfSymbolAtLocation(funcProp, funcInitializer)
  const sig = getFirstCallSignature(funcType)
  if (!sig) return

  const params = sig.getParameters()
  if (params.length >= 2) {
    const inputType = checker.getTypeOfSymbolAtLocation(
      params[1]!,
      funcInitializer
    )
    if (!(inputType.flags & ts.TypeFlags.VoidLike)) {
      state.typesLookup.set(pikkuFuncId, [inputType])
    }
  }
}
