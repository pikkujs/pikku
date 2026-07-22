import * as ts from 'typescript'
import type { InspectorState, InspectorLogger } from '../types.js'

/**
 * Detect wireRemoteAddon({ name: '...', package: '...' }) call expressions and
 * record the namespace as a **remote** addon declaration. Only name + package
 * are needed for codegen (serverUrl/auth are runtime closures resolved by the
 * RPC runner); the `remote` marker tells the consumer's RPC-map generator to
 * import the addon's `.remote.gen` map instead of `.internal.gen`.
 */
export function addWireRemoteAddon(
  node: ts.Node,
  state: InspectorState,
  logger: InspectorLogger
) {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args } = node
  if (!ts.isIdentifier(expression) || expression.text !== 'wireRemoteAddon')
    return

  const [firstArg] = args
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  let name: string | undefined
  let pkg: string | undefined
  // The auth binding is a runtime closure; we only extract the statically
  // knowable slot names so `pikku verify` can check they exist in the
  // consumer's own wirings. `hasAuth` distinguishes "public" (omitted) from
  // "bound via a custom resolve()" (present but no static id).
  let hasAuth = false
  let authCredentialId: string | undefined
  let authSecretId: string | undefined

  for (const prop of firstArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue
    const key = prop.name.text
    if (key === 'name' && ts.isStringLiteral(prop.initializer)) {
      name = prop.initializer.text
    } else if (key === 'package' && ts.isStringLiteral(prop.initializer)) {
      pkg = prop.initializer.text
    } else if (
      key === 'auth' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      hasAuth = true
      for (const authProp of prop.initializer.properties) {
        if (
          !ts.isPropertyAssignment(authProp) ||
          !ts.isIdentifier(authProp.name)
        )
          continue
        if (
          authProp.name.text === 'credentialId' &&
          ts.isStringLiteral(authProp.initializer)
        ) {
          authCredentialId = authProp.initializer.text
        } else if (
          authProp.name.text === 'secretId' &&
          ts.isStringLiteral(authProp.initializer)
        ) {
          authSecretId = authProp.initializer.text
        }
      }
    }
  }

  if (!name || !pkg) return

  logger.debug(`• Found wireRemoteAddon: ${name} → ${pkg} (remote)`)
  state.rpc.wireAddonDeclarations.set(name, {
    package: pkg,
    remote: true,
    hasAuth,
    authCredentialId,
    authSecretId,
  })
  state.rpc.usedAddons.add(name)
  state.rpc.wireAddonFiles.add(node.getSourceFile().fileName)
}
