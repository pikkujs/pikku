import * as ts from 'typescript'
import { getNamesAndTypes } from './utils.js'
import { InspectorState, InspectorFilters } from './types.js'

function unwrapPromise(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  if (!type || !type.symbol) return type

  const isPromise =
    type.symbol.name === 'Promise' &&
    checker.getFullyQualifiedName(type.symbol).includes('Promise')

  if (isPromise && type.aliasTypeArguments?.length === 1) {
    return type.aliasTypeArguments[0]
  }

  // fallback: check type arguments directly if not an alias
  if (isPromise && (type as ts.TypeReference).typeArguments?.length === 1) {
    return (type as ts.TypeReference).typeArguments![0]
  }

  return type
}

/**
 * Given a CallExpression like `const foo = pikkuFunc(...)` or
 * `pikkuFunc({ name: 'bar', … })`, returns the identifier (`foo` or `bar`),
 * or `null` if none can be determined.
 */
export function extractFunctionName(
  callExpr: ts.CallExpression
): string | null {
  // 1) If it's assigned to a variable: const foo = pikkuFunc(...)
  const parent = callExpr.parent
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }

  // 2) If it's part of a property assignment: { foo: pikkuFunc(...) }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }

  // 3) If you passed an object literal with a `name: '…'` prop
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

  // 4) nothing matched—give up
  return null
}

export function addFunctions(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  filters: InspectorFilters
) {
  // 1) Only care about call expressions
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args, typeArguments } = node

  // 2) Is this our pikkuFunc hook?
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuFunc') return

  // must pass a handler
  if (args.length === 0) return
  const firstArg = args[0]

  const funcName = extractFunctionName(node)
  if (!funcName) {
    console.error('Couldn’t determine function name—skipping.')
    return
  }

  // 3) Convert any <In, Out> TypeNodes into ts.Type objects
  const genericTypes: ts.Type[] = (typeArguments ?? []).map((typeNode) =>
    checker.getTypeFromTypeNode(typeNode)
  )

  // 4) Extract Input (first generic or bail)
  const { names: inputNames, types: inputTypes } = getNamesAndTypes(
    checker,
    state.functions.typesMap,
    'Input',
    funcName,
    genericTypes[0] // an array of zero-or-one ts.Type
  )

  if (inputTypes.length === 0) {
    console.error(
      `\x1b[31m• No input type found for ${funcName}. Input type is required.\x1b[0m`
    )
    return
  }

  // 5) Extract Output
  let outputNames: string[] = []

  if (genericTypes.length >= 2) {
    // They passed <In, Out>
    const { names } = getNamesAndTypes(
      checker,
      state.functions.typesMap,
      'Output',
      funcName,
      genericTypes[1]
    )
    outputNames = names
  } else if (
    ts.isArrowFunction(firstArg) ||
    ts.isFunctionExpression(firstArg)
  ) {
    // Infer return type via signature
    const sig = checker.getSignatureFromDeclaration(firstArg)
    if (sig) {
      const retType = unwrapPromise(checker, checker.getReturnTypeOfSignature(sig))
      const { names } = getNamesAndTypes(
        checker,
        state.functions.typesMap,
        'Output',
        funcName,
        retType
      )
      outputNames = names
    }
  }

  // 7) Add file
  state.functions.files.add(node.getSourceFile().fileName)

  state.functions.meta.push({
    name: funcName,
    input: inputNames[0] ?? null,
    output: outputNames[0] ?? null
  })

  console.log(outputNames, state.functions.typesMap)
}
