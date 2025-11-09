import * as ts from 'typescript'

export const extractTypeKeys = (type: ts.Type): string[] => {
  return type.getProperties().map((symbol) => symbol.getName())
}

/**
 * Resolve an identifier or call expression to the actual function declaration
 */
export function resolveFunctionDeclaration(
  node: ts.Node,
  checker: ts.TypeChecker
): ts.Node | null {
  // If it's already a function-like node, return it
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  ) {
    return node
  }

  // If it's a call expression (e.g., pikkuWorkflowFunc(...)), get its first argument
  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    const firstArg = node.arguments[0]
    if (ts.isFunctionExpression(firstArg) || ts.isArrowFunction(firstArg)) {
      return firstArg
    }
  }

  // If it's an identifier, resolve to declaration
  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (!symbol) return null

    // Try valueDeclaration first, then fallback to declarations[0]
    const decl = symbol.valueDeclaration || symbol.declarations?.[0]
    if (!decl) return null

    // If it's an import specifier, resolve the aliased symbol
    if (ts.isImportSpecifier(decl)) {
      const aliasedSymbol = checker.getAliasedSymbol(symbol)
      if (aliasedSymbol) {
        const aliasedDecl =
          aliasedSymbol.valueDeclaration || aliasedSymbol.declarations?.[0]
        if (aliasedDecl) {
          // For variable declarations, get the initializer
          if (
            ts.isVariableDeclaration(aliasedDecl) &&
            aliasedDecl.initializer
          ) {
            return resolveFunctionDeclaration(aliasedDecl.initializer, checker)
          }
          // For function declarations, return directly
          if (ts.isFunctionDeclaration(aliasedDecl)) {
            return aliasedDecl
          }
        }
      }
    }

    // If it's a variable declaration, get the initializer
    if (ts.isVariableDeclaration(decl) && decl.initializer) {
      return resolveFunctionDeclaration(decl.initializer, checker)
    }

    // If it's a function declaration
    if (ts.isFunctionDeclaration(decl)) {
      return decl
    }
  }

  return null
}

export function getPropertyAssignmentInitializer(
  obj: ts.ObjectLiteralExpression,
  propName: string,
  followShorthand = false,
  checker?: ts.TypeChecker
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    // ①  foo: () => {}
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return prop.initializer
    }

    // ②  foo() { … }
    if (
      ts.isMethodDeclaration(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propName
    ) {
      return prop.name // the method node *is* the function
    }

    // ③  { foo }  (shorthand)
    if (
      followShorthand &&
      ts.isShorthandPropertyAssignment(prop) &&
      prop.name.text === propName
    ) {
      if (!checker) return prop.name // best effort without a checker

      // Use the proper TypeScript API for shorthand property resolution
      let sym = checker.getShorthandAssignmentValueSymbol(prop)
      if (sym && sym.flags & ts.SymbolFlags.Alias) {
        sym = checker.getAliasedSymbol(sym)
      }

      const decl = sym?.declarations?.[0]

      // const foo = () => {} or const foo = pikkuFunc(...)
      if (
        decl &&
        ts.isVariableDeclaration(decl) &&
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) ||
          ts.isFunctionExpression(decl.initializer) ||
          ts.isCallExpression(decl.initializer))
      ) {
        return decl.initializer
      }

      // function foo() {}
      if (
        decl &&
        (ts.isFunctionDeclaration(decl) ||
          ts.isArrowFunction(decl) ||
          ts.isFunctionExpression(decl))
      ) {
        return decl as ts.Expression
      }

      // fallback – just give back the identifier
      return prop.name
    }
  }

  return undefined
}
