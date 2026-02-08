import * as ts from 'typescript'

/**
 * Resolve an identifier to its definition, optionally unwrapping
 * known "define" wrapper functions (e.g. defineHTTPRoutes, defineCLICommands).
 *
 * When the identifier resolves to a variable whose initializer is a call
 * to one of the `unwrapFunctionNames`, the first argument of that call
 * is returned instead.
 */
export function resolveIdentifier(
  node: ts.Identifier,
  checker: ts.TypeChecker,
  unwrapFunctionNames?: string[]
): ts.Node | undefined {
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return undefined

  // Handle aliased symbols (imports)
  let resolvedSymbol = symbol
  if (resolvedSymbol.flags & ts.SymbolFlags.Alias) {
    resolvedSymbol = checker.getAliasedSymbol(resolvedSymbol) ?? resolvedSymbol
  }

  const decl =
    resolvedSymbol.valueDeclaration || resolvedSymbol.declarations?.[0]
  if (!decl) return undefined

  // Follow to the actual value (handles imports, variable declarations)
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    // Check if it's a call to one of the unwrap functions
    if (
      ts.isCallExpression(decl.initializer) &&
      unwrapFunctionNames &&
      unwrapFunctionNames.length > 0
    ) {
      const expr = decl.initializer.expression
      if (ts.isIdentifier(expr) && unwrapFunctionNames.includes(expr.text)) {
        return decl.initializer.arguments[0]
      }
    }
    return decl.initializer
  }

  return undefined
}
