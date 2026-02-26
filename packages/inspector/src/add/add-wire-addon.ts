import * as ts from 'typescript'
import { InspectorState, InspectorLogger } from '../types.js'

/**
 * Detect wireAddon({ name: '...', package: '...' }) call expressions and
 * populate state.rpc.wireAddonDeclarations and state.rpc.usedAddons.
 */
export function addWireAddon(
  node: ts.Node,
  state: InspectorState,
  logger: InspectorLogger
) {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireAddon') return

  const [firstArg] = args
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  let name: string | undefined
  let pkg: string | undefined
  let rpcEndpoint: string | undefined

  for (const prop of firstArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const key = prop.name.text
    if (key === 'name' && ts.isStringLiteral(prop.initializer)) {
      name = prop.initializer.text
    } else if (key === 'package' && ts.isStringLiteral(prop.initializer)) {
      pkg = prop.initializer.text
    } else if (key === 'rpcEndpoint' && ts.isStringLiteral(prop.initializer)) {
      rpcEndpoint = prop.initializer.text
    }
  }

  if (!name || !pkg) return

  logger.debug(`• Found wireAddon: ${name} → ${pkg}`)
  state.rpc.wireAddonDeclarations.set(name, { package: pkg, rpcEndpoint })
  state.rpc.usedAddons.add(name)
}
