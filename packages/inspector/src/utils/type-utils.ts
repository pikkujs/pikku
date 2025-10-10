import * as ts from 'typescript'

export const extractTypeKeys = (type: ts.Type): string[] => {
  return type.getProperties().map((symbol) => symbol.getName())
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

      let sym = checker.getSymbolAtLocation(prop.name)
      if (sym && sym.flags & ts.SymbolFlags.Alias) {
        sym = checker.getAliasedSymbol(sym)
      }

      const decl = sym?.declarations?.[0]

      // const foo = () => {}
      if (
        decl &&
        ts.isVariableDeclaration(decl) &&
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) ||
          ts.isFunctionExpression(decl.initializer))
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
