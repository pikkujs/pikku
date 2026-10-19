import * as ts from 'typescript'
import type { InspectorState, InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { parseRemoteAddonPackage } from '../utils/remote-addon-sdk.js'

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
  let pkgNode: ts.Expression | undefined
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
    } else if (key === 'package') {
      pkgNode = prop.initializer
      if (ts.isStringLiteralLike(prop.initializer)) {
        pkg = prop.initializer.text
      }
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

  if (pkgNode && pkg === undefined) {
    logger.critical(
      ErrorCode.REMOTE_ADDON_PACKAGE_NOT_STATIC,
      `wireRemoteAddon(${name ? `'${name}'` : '…'}) in ${node.getSourceFile().fileName} sets package to '${pkgNode.getText()}', which is not a string literal. Write the package (and its version range) inline, e.g. package: '@scope/addon@^1.0.0', so it can be read without running the file.`
    )
    return
  }
  if (!name || !pkg) return

  let packageName: string
  let range: string | undefined
  try {
    ;({ name: packageName, range } = parseRemoteAddonPackage(pkg))
  } catch (e) {
    logger.critical(
      ErrorCode.REMOTE_ADDON_PACKAGE_INVALID,
      `wireRemoteAddon('${name}'): ${e instanceof Error ? e.message : e}`
    )
    return
  }

  logger.debug(
    `• Found wireRemoteAddon: ${name} → ${packageName}${range ? `@${range}` : ''} (remote)`
  )
  state.rpc.wireAddonDeclarations.set(name, {
    package: packageName,
    ...(range ? { range } : {}),
    file: node.getSourceFile().fileName,
    remote: true,
    hasAuth,
    authCredentialId,
    authSecretId,
  })
  state.rpc.usedAddons.add(name)
  state.rpc.wireAddonFiles.add(node.getSourceFile().fileName)
}
