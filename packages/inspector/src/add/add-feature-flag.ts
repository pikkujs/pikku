import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

const SEPARATOR = ':'

const unwrapAs = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    ? unwrapAs(node.expression)
    : node

/**
 * Reads an optional `anyOf: [...]` array of string literals.
 *
 * Absent is not the same as empty: absent means no capability constraint, which
 * is the shape of a pure kill switch, while an empty array satisfies nobody and
 * is rejected downstream as a declaration mistake.
 */
const extractAnyOf = (
  obj: ts.ObjectLiteralExpression,
  flagName: string,
  logger: Parameters<AddWiring>[0]
): string[] | undefined => {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === 'anyOf'
  )

  if (!prop) {
    return undefined
  }

  if (
    !ts.isPropertyAssignment(prop) ||
    !ts.isArrayLiteralExpression(prop.initializer)
  ) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `Feature flag '${flagName}' must declare 'anyOf' as an array literal.`
    )
    return undefined
  }

  const scopes: string[] = []
  for (const element of prop.initializer.elements) {
    const unwrapped = unwrapAs(element)
    if (!ts.isStringLiteral(unwrapped)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Feature flag '${flagName}' lists a scope that is not a string literal. ` +
          `Scopes are extracted by AST, so a computed value cannot be checked against the declared set.`
      )
      continue
    }
    scopes.push(unwrapped.text)
  }
  return scopes
}

export const addFeatureFlag: AddWiring = (
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
  if (
    !ts.isIdentifier(expression) ||
    expression.text !== 'defineFeatureFlags'
  ) {
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
        'A feature flag is declared with a key that is not a literal.'
      )
      continue
    }

    if (name.length === 0) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        'A feature flag is declared with an empty name.'
      )
      continue
    }

    if (name.includes(SEPARATOR)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Feature flag '${name}' contains the '${SEPARATOR}' separator. ` +
          `'${SEPARATOR}' delimits scope ids; a flag named like a scope reads as one.`
      )
      continue
    }

    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Feature flag '${name}' must be an object literal.`
      )
      continue
    }

    const anyOf = extractAnyOf(prop.initializer, name, logger)

    if (anyOf !== undefined && anyOf.length === 0) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Feature flag '${name}' declares 'anyOf: []'. An empty list satisfies ` +
          `nobody: omit 'anyOf' for a pure switch, or name the scopes that reveal it.`
      )
      continue
    }

    const description = getPropertyValue(prop.initializer, 'description') as
      string | null

    state.featureFlags.files.add(sourceFile)
    state.featureFlags.definitions.push({
      name,
      description: description || undefined,
      anyOf,
      sourceFile,
    })
  }
}
