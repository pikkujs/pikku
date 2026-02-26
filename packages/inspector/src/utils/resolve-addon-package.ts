import * as ts from 'typescript'

/**
 * Resolve the external package name from an imported identifier.
 * Checks if the identifier's import module specifier matches any
 * configured external package.
 *
 * This is a general utility — any wire handler that processes a `func`
 * property can use it to detect when the function comes from an
 * external package.
 */
export const resolveAddonName = (
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  wireAddonDeclarations?: Map<
    string,
    {
      package: string
      rpcEndpoint?: string
      secretOverrides?: Record<string, string>
      variableOverrides?: Record<string, string>
    }
  >
): string | null => {
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) {
    return null
  }

  const sym = checker.getSymbolAtLocation(identifier)
  if (!sym) return null

  const decl = sym.declarations?.[0]
  if (!decl || !ts.isImportSpecifier(decl)) return null

  // ImportSpecifier -> NamedImports -> ImportClause -> ImportDeclaration
  const importDecl = decl.parent?.parent?.parent
  if (!importDecl || !ts.isImportDeclaration(importDecl)) return null
  if (!ts.isStringLiteral(importDecl.moduleSpecifier)) return null

  const moduleSpecifier = importDecl.moduleSpecifier.text

  for (const addonDecl of wireAddonDeclarations.values()) {
    if (addonDecl.package === moduleSpecifier) {
      return addonDecl.package
    }
  }

  return null
}
