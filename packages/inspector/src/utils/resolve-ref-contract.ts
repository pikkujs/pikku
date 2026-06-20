import * as ts from 'typescript'

export interface RefContractResolution<T> {
  contract: T
  /**
   * Optional basePath override supplied by the consumer via the second
   * argument, e.g. refHTTP('ns:routes', { basePath: '/ext' }). When undefined
   * the addon contract's own basePath is preserved.
   */
  basePath?: string
}

const getStringProperty = (
  obj: ts.ObjectLiteralExpression,
  name: string
): string | undefined => {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
      prop.name.text === name &&
      ts.isStringLiteral(prop.initializer)
    ) {
      return prop.initializer.text
    }
  }
  return undefined
}

/**
 * Resolve a refHTTP / refChannel / refCLI call expression against the addon
 * contracts already loaded (and namespaced) by loadAddonFunctionsMeta.
 *
 * The first string argument has the form 'namespace:contractName', mirroring
 * how ref('namespace:fn') references an addon function. Detection is purely
 * syntactic — no import resolution is required because the namespace and
 * contract name are carried in the string literal. An optional second object
 * argument may override mount details such as basePath.
 */
export const resolveRefContract = <T>(
  node: ts.Node,
  helperName: 'refHTTP' | 'refChannel' | 'refCLI',
  addonContracts: Record<string, Record<string, T>>
): RefContractResolution<T> | null => {
  if (!ts.isCallExpression(node)) return null
  if (
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== helperName
  ) {
    return null
  }

  const [arg, optionsArg] = node.arguments
  if (!arg || !ts.isStringLiteral(arg)) return null

  const separator = arg.text.indexOf(':')
  if (separator === -1) return null

  const namespace = arg.text.slice(0, separator)
  const contractName = arg.text.slice(separator + 1)

  const contract = addonContracts[namespace]?.[contractName]
  if (contract === undefined) return null

  let basePath: string | undefined
  if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
    basePath = getStringProperty(optionsArg, 'basePath')
  }

  return { contract, basePath }
}
