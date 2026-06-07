import * as ts from 'typescript'
import { resolveAddonName } from './resolve-addon-package.js'

type WireAddonDeclarations = Map<
  string,
  {
    package: string
    rpcEndpoint?: string
    secretOverrides?: Record<string, string>
    variableOverrides?: Record<string, string>
    credentialOverrides?: Record<string, string>
  }
>

const getExportName = (decl: ts.Declaration): string | null => {
  if (ts.isImportSpecifier(decl)) {
    return decl.propertyName?.text ?? decl.name.text
  }
  return null
}

export const resolveImportedAddonContract = <T>(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
  wireAddonDeclarations: WireAddonDeclarations | undefined,
  addonContracts: Record<string, Record<string, T>>
): T | null => {
  if (!wireAddonDeclarations || wireAddonDeclarations.size === 0) {
    return null
  }

  const symbol = checker.getSymbolAtLocation(identifier)
  if (!symbol) return null

  const decl = symbol.declarations?.[0]
  if (!decl) return null

  const exportName = getExportName(decl)
  if (!exportName) return null

  const packageName = resolveAddonName(
    identifier,
    checker,
    wireAddonDeclarations
  )
  if (!packageName) return null

  let namespace: string | null = null
  for (const [candidateNamespace, candidateDecl] of wireAddonDeclarations) {
    if (candidateDecl.package === packageName) {
      namespace = candidateNamespace
      break
    }
  }

  if (!namespace) return null

  return addonContracts[namespace]?.[exportName] ?? null
}
