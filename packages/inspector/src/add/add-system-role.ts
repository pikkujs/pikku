import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

const SEPARATOR = ':'

/**
 * Unwraps `x as const` / `x satisfies T` so a cast declaration is still
 * extracted rather than silently skipped.
 */
const unwrapAs = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    ? unwrapAs(node.expression)
    : node

/**
 * Reads a `scopes: [...]` array of string literals.
 *
 * Returns `undefined` rather than an empty array when the property is absent
 * or unreadable, so the caller can tell "declared no scopes" from "we could
 * not see the scopes" — the first is a legitimate placeholder role, the second
 * would silently produce one.
 */
const extractScopes = (
  obj: ts.ObjectLiteralExpression,
  roleName: string,
  logger: Parameters<AddWiring>[0]
): string[] | undefined => {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'scopes'
  )

  if (!prop) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `System role '${roleName}' has no 'scopes'. A role that grants nothing should say so with 'scopes: []'.`
    )
    return undefined
  }

  if (
    !ts.isPropertyAssignment(prop) ||
    !ts.isArrayLiteralExpression(prop.initializer)
  ) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `System role '${roleName}' must declare 'scopes' as an array literal.`
    )
    return undefined
  }

  const scopes: string[] = []
  for (const element of prop.initializer.elements) {
    const unwrapped = unwrapAs(element)
    if (!ts.isStringLiteral(unwrapped)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `System role '${roleName}' lists a scope that is not a string literal. ` +
          `Scopes are extracted by AST, so a computed value cannot be checked against the declared set.`
      )
      continue
    }
    scopes.push(unwrapped.text)
  }
  return scopes
}

export const addSystemRole: AddWiring = (
  logger,
  node,
  _checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'defineSystemRole') {
    return
  }

  const firstArg = node.arguments[0]
  if (!firstArg) {
    return
  }

  const unwrapped = unwrapAs(firstArg)
  if (!ts.isObjectLiteralExpression(unwrapped)) {
    return
  }

  const sourceFile = node.getSourceFile().fileName

  for (const prop of unwrapped.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue
    }

    let name: string | undefined
    if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
      name = prop.name.text
    }

    if (name === undefined) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        'A system role is declared with a key that is not a literal.'
      )
      continue
    }

    if (name.length === 0) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        'A system role is declared with an empty name.'
      )
      continue
    }

    if (name.includes(SEPARATOR)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `System role '${name}' contains the '${SEPARATOR}' separator. ` +
          `'${SEPARATOR}' delimits scope ids; a role named like a scope reads as one.`
      )
      continue
    }

    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `System role '${name}' must be an object literal.`
      )
      continue
    }

    const scopes = extractScopes(prop.initializer, name, logger)
    if (scopes === undefined) {
      continue
    }

    const displayName = getPropertyValue(prop.initializer, 'displayName') as
      | string
      | null
    const description = getPropertyValue(prop.initializer, 'description') as
      | string
      | null

    state.systemRoles.files.add(sourceFile)
    state.systemRoles.definitions.push({
      name,
      displayName: displayName || undefined,
      description: description || undefined,
      scopes,
      sourceFile,
    })
  }
}
