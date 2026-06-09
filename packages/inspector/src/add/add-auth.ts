import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

export const addAuth: AddWiring = (logger, node, _checker, state) => {
  if (!ts.isCallExpression(node)) return

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'wireAuth') return

  const firstArg = node.arguments[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  const providersProp = firstArg.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'providers'
  ) as ts.PropertyAssignment | undefined

  if (
    !providersProp ||
    !ts.isArrayLiteralExpression(providersProp.initializer)
  ) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireAuth: providers must be an array literal of string literals.'
    )
    return
  }

  const providers: string[] = []
  for (const element of (providersProp.initializer as ts.ArrayLiteralExpression)
    .elements) {
    if (!ts.isStringLiteral(element)) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        `wireAuth: each provider must be a string literal. Found: ${element.getText()}`
      )
      return
    }
    providers.push(element.text)
  }

  const sourceFile = node.getSourceFile().fileName
  state.auth.files.add(sourceFile)

  for (const p of providers) {
    if (!state.auth.providers.includes(p)) {
      state.auth.providers.push(p)
    }
  }
}
