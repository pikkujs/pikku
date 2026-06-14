import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

/**
 * Detects `defineAuth({...})` calls.
 *
 * `defineAuth` is pure: it returns an auth config object with NO side effects.
 * The user assigns it to an exported binding, e.g.
 *
 *   export const auth = defineAuth({ ... })
 *
 * The pikku CLI discovers that single export and generates an explicit-route
 * `auth.gen.ts` that wires every `/auth/*` route to one shared handler — so the
 * routes flow through normal inspection into the deploy manifest, instead of a
 * runtime-only side-channel hidden in node_modules.
 *
 * This add-wiring records the exported binding name, source file, and basePath
 * into `state.auth.definition` so the CLI knows what to import and generate.
 * Exactly one `defineAuth` is allowed per codebase; a second is a critical error.
 */
export const addAuth: AddWiring = (logger, node, _checker, state) => {
  if (!ts.isCallExpression(node)) return

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'defineAuth') return

  const sourceFile = node.getSourceFile().fileName

  // Walk up to the `export const <name> = defineAuth(...)` binding.
  const varDecl = node.parent
  if (!ts.isVariableDeclaration(varDecl) || !ts.isIdentifier(varDecl.name)) {
    logger.critical(
      ErrorCode.AUTH_NOT_EXPORTED,
      `defineAuth(...) must be assigned to an exported const, e.g. \`export const auth = defineAuth({...})\` in ${sourceFile}`
    )
    return
  }
  const exportName = varDecl.name.text

  // VariableDeclaration -> VariableDeclarationList -> VariableStatement
  const declList = varDecl.parent
  const varStatement = declList?.parent
  const isExported =
    varStatement &&
    ts.isVariableStatement(varStatement) &&
    varStatement.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    )
  if (!isExported) {
    logger.critical(
      ErrorCode.AUTH_NOT_EXPORTED,
      `defineAuth(...) must be assigned to an exported const so the CLI can import it. Add \`export\` to \`const ${exportName}\` in ${sourceFile}`
    )
    return
  }

  if (state.auth.definition) {
    logger.critical(
      ErrorCode.DUPLICATE_AUTH_DEFINITION,
      `Only one defineAuth(...) is allowed per codebase. Found a second in ${sourceFile} (first: ${state.auth.definition.sourceFile}).`
    )
    return
  }

  state.auth.files.add(sourceFile)

  const firstArg = node.arguments[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `defineAuth: the first argument must be an object literal in ${sourceFile}`
    )
    return
  }

  // Optional basePath string literal (default /auth).
  let basePath = '/auth'
  const basePathProp = firstArg.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'basePath'
  ) as ts.PropertyAssignment | undefined
  if (basePathProp) {
    if (!ts.isStringLiteral(basePathProp.initializer)) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        `defineAuth: basePath must be a string literal. Found: ${basePathProp.initializer.getText()}`
      )
      return
    }
    basePath = basePathProp.initializer.text
  }

  state.auth.definition = { exportName, sourceFile, basePath }

  // Collect OAuth provider ids (optional — credentials-only auth has none).
  const providersProp = firstArg.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'providers'
  ) as ts.PropertyAssignment | undefined

  if (providersProp) {
    if (!ts.isArrayLiteralExpression(providersProp.initializer)) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        'defineAuth: providers must be an array literal of string literals.'
      )
      return
    }
    for (const element of providersProp.initializer.elements) {
      if (!ts.isStringLiteral(element)) {
        logger.critical(
          ErrorCode.NON_LITERAL_WIRE_NAME,
          `defineAuth: each provider must be a string literal. Found: ${element.getText()}`
        )
        return
      }
      if (!state.auth.providers.includes(element.text)) {
        state.auth.providers.push(element.text)
      }
    }
  }
}
