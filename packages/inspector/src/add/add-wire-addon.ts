import * as ts from 'typescript'
import type {
  InspectorState,
  InspectorLogger,
  CredentialOverrideMeta,
} from '../types.js'

function parseStringArray(node: ts.Expression): string[] | undefined {
  if (!ts.isArrayLiteralExpression(node)) return undefined
  const values: string[] = []
  for (const element of node.elements) {
    // A non-literal entry (a spread, a const reference) is not statically
    // knowable. Dropping the whole array rather than a silent partial keeps a
    // consumer from reading a short list as the complete set of gates.
    if (!ts.isStringLiteral(element)) return undefined
    values.push(element.text)
  }
  return values
}

function parseStringRecord(
  obj: ts.ObjectLiteralExpression
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const keyNode = prop.name
    const key = ts.isIdentifier(keyNode)
      ? keyNode.text
      : ts.isStringLiteral(keyNode)
        ? keyNode.text
        : undefined
    if (key && ts.isStringLiteral(prop.initializer)) {
      result[key] = prop.initializer.text
    }
  }
  return result
}

/**
 * `credentialOverrides` takes either a rename string or an object that also
 * decides where the value is read from, so it cannot use `parseStringRecord`.
 * A non-literal member is dropped rather than guessed at — the wiring is read
 * statically, and a value this cannot see must not be reported as a mode.
 */
function parseCredentialOverrideRecord(
  obj: ts.ObjectLiteralExpression
): Record<string, CredentialOverrideMeta> {
  const result: Record<string, CredentialOverrideMeta> = {}
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const keyNode = prop.name
    const key = ts.isIdentifier(keyNode)
      ? keyNode.text
      : ts.isStringLiteral(keyNode)
        ? keyNode.text
        : undefined
    if (!key) continue

    if (ts.isStringLiteral(prop.initializer)) {
      result[key] = prop.initializer.text
      continue
    }
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue

    const override: Exclude<CredentialOverrideMeta, string> = {}
    for (const member of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(member)) continue
      const memberKey = ts.isIdentifier(member.name)
        ? member.name.text
        : ts.isStringLiteral(member.name)
          ? member.name.text
          : undefined
      if (!memberKey || !ts.isStringLiteral(member.initializer)) continue
      if (memberKey === 'name') override.name = member.initializer.text
      else if (memberKey === 'secret') override.secret = member.initializer.text
      else if (
        memberKey === 'mode' &&
        (member.initializer.text === 'wire' ||
          member.initializer.text === 'singleton')
      ) {
        override.mode = member.initializer.text
      }
    }
    result[key] = override
  }
  return result
}

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
  let mcp: boolean | undefined
  let auth: boolean | undefined
  let tags: string[] | undefined
  let scopes: string[] | undefined
  let secretOverrides: Record<string, string> | undefined
  let variableOverrides: Record<string, string> | undefined
  let credentialOverrides: Record<string, CredentialOverrideMeta> | undefined
  let secretGrants: string[] | undefined
  let credentialGrants: string[] | undefined
  let globalSecrets: string | undefined
  let globalCredentials: string | undefined

  for (const prop of firstArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue

    const key = prop.name.text
    if (key === 'name' && ts.isStringLiteral(prop.initializer)) {
      name = prop.initializer.text
    } else if (key === 'package' && ts.isStringLiteral(prop.initializer)) {
      pkg = prop.initializer.text
    } else if (key === 'rpcEndpoint' && ts.isStringLiteral(prop.initializer)) {
      rpcEndpoint = prop.initializer.text
    } else if (
      key === 'mcp' &&
      (prop.initializer.kind === ts.SyntaxKind.TrueKeyword ||
        prop.initializer.kind === ts.SyntaxKind.FalseKeyword)
    ) {
      mcp = prop.initializer.kind === ts.SyntaxKind.TrueKeyword
    } else if (
      key === 'auth' &&
      (prop.initializer.kind === ts.SyntaxKind.TrueKeyword ||
        prop.initializer.kind === ts.SyntaxKind.FalseKeyword)
    ) {
      auth = prop.initializer.kind === ts.SyntaxKind.TrueKeyword
    } else if (key === 'tags') {
      tags = parseStringArray(prop.initializer)
    } else if (key === 'scopes') {
      scopes = parseStringArray(prop.initializer)
    } else if (
      key === 'secretOverrides' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      secretOverrides = parseStringRecord(prop.initializer)
    } else if (
      key === 'variableOverrides' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      variableOverrides = parseStringRecord(prop.initializer)
    } else if (
      key === 'credentialOverrides' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      credentialOverrides = parseCredentialOverrideRecord(prop.initializer)
    } else if (key === 'secretGrants') {
      secretGrants = parseStringArray(prop.initializer)
    } else if (key === 'credentialGrants') {
      credentialGrants = parseStringArray(prop.initializer)
    } else if (key === 'globalSecrets') {
      // The grant is real at runtime whatever the reason evaluates to, so a
      // non-literal is recorded as its source text rather than dropped.
      globalSecrets = ts.isStringLiteral(prop.initializer)
        ? prop.initializer.text
        : prop.initializer.getText()
    } else if (key === 'globalCredentials') {
      globalCredentials = ts.isStringLiteral(prop.initializer)
        ? prop.initializer.text
        : prop.initializer.getText()
    }
  }

  if (!name || !pkg) return

  logger.debug(`• Found wireAddon: ${name} → ${pkg}`)
  state.rpc.wireAddonDeclarations.set(name, {
    package: pkg,
    rpcEndpoint,
    mcp,
    auth,
    tags,
    scopes,
    secretOverrides,
    variableOverrides,
    credentialOverrides,
    secretGrants,
    credentialGrants,
    globalSecrets,
    globalCredentials,
  })
  state.rpc.usedAddons.add(name)
  state.rpc.wireAddonFiles.add(node.getSourceFile().fileName)
}
