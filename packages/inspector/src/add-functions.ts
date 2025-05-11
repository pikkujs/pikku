import * as ts from 'typescript'
import { getNamesAndTypes } from './utils.js'
import { InspectorState, InspectorFilters } from './types.js'

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
    return type.aliasTypeArguments[0]
  }

  // fallback for raw TypeReference  
  if (isPromise && (type as ts.TypeReference).typeArguments?.length === 1) {
    return (type as ts.TypeReference).typeArguments![0]
  }

  return type
}

/**
 * Given a CallExpression like `const foo = pikkuFunc(...)` or
 * `pikkuFunc({ name: 'bar', func: () => {} })`, returns the identifier
 * (`foo` or `'bar'`), or `null` if none can be determined.
 */
export function extractFunctionName(callExpr: ts.CallExpression): string | null {
  let fallbackName: string | null = null
  const parent = callExpr.parent

  // 1) const foo = pikkuFunc(...)
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    fallbackName = parent.name.text
  }

  // 2) { foo: pikkuFunc(...) }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    fallbackName = parent.name.text
  }

  // 3) pikkuFunc({ name: '…', func: … })
  const firstArg = callExpr.arguments[0]
  if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
    for (const prop of firstArg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'name' &&
        ts.isStringLiteral(prop.initializer)
      ) {
        return prop.initializer.text
      }
    }
  }

  return fallbackName
}

export function addFunctions(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) {
  // 1) bail if not a call
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args, typeArguments } = node

  // 2) only handle pikkuFunc
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuFunc') return

  // 3) must have at least one arg
  if (args.length === 0) return

  // 4) figure out the function name
  const funcName = extractFunctionName(node)
  if (!funcName) {
    console.error('Couldn’t determine function name—skipping.')
    return
  }

  // 5) determine the actual handler expression:
  //    either the `func` prop or the first argument directly
  let handlerNode: ts.Expression = args[0]
  if (ts.isObjectLiteralExpression(args[0])) {
    const obj = args[0]
    const funcProp = obj.properties.find(
      p =>
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'func'
    ) as ts.PropertyAssignment | undefined

    if (!funcProp || 
        (!ts.isArrowFunction(funcProp.initializer) && !ts.isFunctionExpression(funcProp.initializer))
    ) {
      console.error(`• No valid 'func' property found for ${funcName}.`)
      return
    }

    handlerNode = funcProp.initializer
  }

  // 6) pull out and unwrap any <In, Out> generics
  const genericTypes: ts.Type[] = (typeArguments ?? [])
    .map(tn => checker.getTypeFromTypeNode(tn))
    .map(t => unwrapPromise(checker, t))

  // 7) extract Input
  const { names: inputNames, types: inputTypes } = getNamesAndTypes(
    checker,
    state.functions.typesMap,
    'Input',
    funcName,
    genericTypes[0]
  )
  if (inputTypes.length === 0) {
    console.error(
      `\x1b[31m• No input type found for ${funcName}. Input type is required.\x1b[0m`
    )
    return
  }

  // 8) extract Output
  let outputNames: string[] = []

  if (genericTypes.length >= 2) {
    // explicit <In, Out>
    outputNames = getNamesAndTypes(
      checker,
      state.functions.typesMap,
      'Output',
      funcName,
      genericTypes[1]
    ).names
  } else if (
    ts.isArrowFunction(handlerNode) ||
    ts.isFunctionExpression(handlerNode)
  ) {
    // infer from signature
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

  // 9) record it
  state.functions.files.add(node.getSourceFile().fileName)
  state.functions.meta.push({
    name: funcName,
    input: inputNames[0] ?? null,
    output: outputNames[0] ?? null,
  })

  console.log(outputNames, state.functions.typesMap)
}
