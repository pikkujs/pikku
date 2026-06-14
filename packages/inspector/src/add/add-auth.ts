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
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'providers'
  ) as ts.PropertyAssignment | undefined

  const sourceFile = node.getSourceFile().fileName
  state.auth.files.add(sourceFile)

  if (!providersProp) {
    // Credentials- and/or callbacks-only `wireAuth`: there are no OAuth
    // providers, so the CLI never generates an `auth.gen.ts` for this call.
    // `wireAuth` registers its /auth/* routes at runtime (it calls
    // `wireHTTPRoutes` internally via `createAuthRoutes`), but the static
    // inspector only sees the outer `wireAuth(...)` call — never the inner
    // `wireHTTPRoutes`. Add the file to the HTTP wiring set so it is imported
    // into the generated bootstrap; otherwise `wireAuth` never executes and the
    // auth routes are absent from the deployed worker.
    //
    // The OAuth-provider path intentionally does NOT do this: those routes are
    // emitted into a generated file (see serializeAuthGen) and importing the
    // user's source file too would double-register the /auth/* routes.
    state.http.files.add(sourceFile)
    return
  }

  if (!ts.isArrayLiteralExpression(providersProp.initializer)) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      'wireAuth: providers must be an array literal of string literals.'
    )
    return
  }

  for (const element of (providersProp.initializer as ts.ArrayLiteralExpression)
    .elements) {
    if (!ts.isStringLiteral(element)) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        `wireAuth: each provider must be a string literal. Found: ${element.getText()}`
      )
      return
    }
    if (!state.auth.providers.includes(element.text)) {
      state.auth.providers.push(element.text)
    }
  }
}
