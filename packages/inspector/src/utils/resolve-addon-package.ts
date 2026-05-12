import * as ts from 'typescript'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, parse } from 'path'

const packageNameCache = new Map<string, string | null>()

const findPackageNameForFile = (filePath: string): string | null => {
  if (packageNameCache.has(filePath)) {
    return packageNameCache.get(filePath)!
  }
  const root = parse(filePath).root
  let dir = dirname(filePath)
  while (dir && dir !== root) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        const name = typeof pkg.name === 'string' ? pkg.name : null
        packageNameCache.set(filePath, name)
        return name
      } catch {
        packageNameCache.set(filePath, null)
        return null
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  packageNameCache.set(filePath, null)
  return null
}

/**
 * Resolve the addon package name from an imported identifier.
 * Checks if the identifier's import module specifier matches any
 * configured addon package — and if the import is relative (because
 * the identifier resolves to a source file inside the addon package
 * itself), walks up to the nearest package.json to obtain the real
 * package name.
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
      credentialOverrides?: Record<string, string>
    }
  >
): string | null => {
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) {
    return null
  }

  const sym = checker.getSymbolAtLocation(identifier)
  if (!sym) return null

  const decl = sym.declarations?.[0]
  if (!decl) return null

  let candidatePackage: string | null = null

  if (ts.isImportSpecifier(decl)) {
    // ImportSpecifier -> NamedImports -> ImportClause -> ImportDeclaration
    const importDecl = decl.parent?.parent?.parent
    if (
      importDecl &&
      ts.isImportDeclaration(importDecl) &&
      ts.isStringLiteral(importDecl.moduleSpecifier)
    ) {
      candidatePackage = importDecl.moduleSpecifier.text
    }
  }

  // Bare package import path
  if (candidatePackage && !candidatePackage.startsWith('.')) {
    for (const addonDecl of wireAddonDeclarations.values()) {
      if (addonDecl.package === candidatePackage) return addonDecl.package
    }
  }

  // Fall back to package.json lookup based on the declaration's source file.
  // This catches the case where the identifier resolves into an addon
  // package's own internal source (relative import inside that package).
  const declFile = decl.getSourceFile()?.fileName
  if (declFile) {
    const pkgName = findPackageNameForFile(declFile)
    if (pkgName) {
      for (const addonDecl of wireAddonDeclarations.values()) {
        if (addonDecl.package === pkgName) return addonDecl.package
      }
    }
  }

  return null
}
