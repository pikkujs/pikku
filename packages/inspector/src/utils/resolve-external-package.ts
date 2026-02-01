import * as ts from 'typescript'
import { ExternalPackageConfig } from '../types.js'

/**
 * Resolve the external package name from an imported identifier.
 * Checks if the identifier's import module specifier matches any
 * configured external package.
 *
 * This is a general utility — any wire handler that processes a `func`
 * property can use it to detect when the function comes from an
 * external package.
 */
export const resolveExternalPackageName = (
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  externalPackages?: Record<string, ExternalPackageConfig>
): string | null => {
  if (!externalPackages || Object.keys(externalPackages).length === 0) {
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

  for (const config of Object.values(externalPackages)) {
    if (config.package === moduleSpecifier) {
      return config.package
    }
  }

  return null
}
