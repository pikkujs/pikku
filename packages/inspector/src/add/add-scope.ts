import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type { AddWiring, InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import type { ScopeNodeMeta } from '@pikku/core/scope'

const SEPARATOR = ':'
const WILDCARD = '*'

/**
 * Validates a single scope segment, reporting rather than throwing so the
 * inspector can surface every problem in one pass.
 *
 * @returns true when the segment is usable.
 */
const isValidSegment = (
  segment: string,
  scopeName: string,
  logger: InspectorLogger
): boolean => {
  if (segment.length === 0) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `Scope '${scopeName}' contains an empty segment.`
    )
    return false
  }
  if (segment.includes(SEPARATOR)) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `Scope segment '${segment}' in '${scopeName}' contains the '${SEPARATOR}' separator. ` +
        `Nest scopes with the 'scopes' property instead of embedding '${SEPARATOR}' in a name.`
    )
    return false
  }
  if (segment === WILDCARD) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `Scope segment '${segment}' in '${scopeName}' is the wildcard. ` +
        `'${WILDCARD}' is reserved for granting a scope and its descendants, and cannot be declared.`
    )
    return false
  }
  return true
}

/**
 * Recursively extracts a `scopes: { ... }` object literal into nested metadata.
 */
const extractScopeNodes = (
  obj: ts.ObjectLiteralExpression,
  scopeName: string,
  logger: InspectorLogger
): Record<string, ScopeNodeMeta> | undefined => {
  const nodes: Record<string, ScopeNodeMeta> = {}

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue
    }

    let segment: string | undefined
    if (ts.isIdentifier(prop.name)) {
      segment = prop.name.text
    } else if (ts.isStringLiteral(prop.name)) {
      segment = prop.name.text
    }

    if (segment === undefined) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        `Scope '${scopeName}' has a nested scope whose key is not a literal.`
      )
      continue
    }

    if (!isValidSegment(segment, scopeName, logger)) {
      continue
    }

    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Nested scope '${segment}' in '${scopeName}' must be an object literal.`
      )
      continue
    }

    const node: ScopeNodeMeta = {}
    const description = getPropertyValue(prop.initializer, 'description') as
      | string
      | null
    if (description) {
      node.description = description
    }

    const nestedProp = prop.initializer.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'scopes'
    )
    if (
      nestedProp &&
      ts.isPropertyAssignment(nestedProp) &&
      ts.isObjectLiteralExpression(nestedProp.initializer)
    ) {
      const nested = extractScopeNodes(
        nestedProp.initializer,
        scopeName,
        logger
      )
      if (nested) {
        node.scopes = nested
      }
    }

    nodes[segment] = node
  }

  return Object.keys(nodes).length > 0 ? nodes : undefined
}

/**
 * Unwraps `x as const` / `x as any` so a cast declaration is still extracted
 * rather than silently skipped.
 */
const unwrapAs = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    ? unwrapAs(node.expression)
    : node

export const addScope: AddWiring = (logger, node, checker, state, _options) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'wireScope') {
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

  // Roots are keyed exactly like the nodes beneath them, so each property of
  // the call's single argument is one tree.
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
        'A scope is declared with a key that is not a literal.'
      )
      continue
    }

    if (!isValidSegment(name, name, logger)) {
      continue
    }

    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Scope '${name}' must be an object literal.`
      )
      continue
    }

    const root = prop.initializer
    const displayNameValue = getPropertyValue(root, 'displayName') as
      | string
      | null
    const descriptionValue = getPropertyValue(root, 'description') as
      | string
      | null

    let scopes: Record<string, ScopeNodeMeta> | undefined
    const scopesProp = root.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'scopes'
    )
    if (
      scopesProp &&
      ts.isPropertyAssignment(scopesProp) &&
      ts.isObjectLiteralExpression(scopesProp.initializer)
    ) {
      scopes = extractScopeNodes(scopesProp.initializer, name, logger)
    }

    state.scopes.files.add(sourceFile)
    state.scopes.definitions.push({
      name,
      displayName: displayNameValue || undefined,
      description: descriptionValue || undefined,
      scopes,
      sourceFile,
    })
  }
}
