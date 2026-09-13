import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

const SEPARATOR = ':'
const DEFINE_FEATURE_FLAGS = 'defineFeatureFlags'

/**
 * A call is the pikku one when the symbol it resolves to is, whatever the file
 * chose to call it locally — `import { defineFeatureFlags as declare }` is an
 * ordinary thing to write, and matching on the callee's text alone both misses
 * that and claims a same-named local helper.
 */
const callsDefineFeatureFlags = (
  expression: ts.Expression,
  checker: ts.TypeChecker
): boolean => {
  if (!ts.isIdentifier(expression)) return false
  const symbol = checker.getSymbolAtLocation(expression)
  if (!symbol) return expression.text === DEFINE_FEATURE_FLAGS
  // An import specifier names what it imported even when the module itself does
  // not resolve, which is every project whose deps are not installed yet.
  const declaration = symbol.declarations?.[0]
  if (declaration && ts.isImportSpecifier(declaration)) {
    return (
      (declaration.propertyName ?? declaration.name).text ===
      DEFINE_FEATURE_FLAGS
    )
  }
  // Only an imported symbol can be pikku's. A local const of the same name is
  // a helper the file wrote for itself, and resolving it by name alone would
  // claim it.
  if (!(symbol.flags & ts.SymbolFlags.Alias)) return false
  const resolved = checker.getAliasedSymbol(symbol) ?? symbol
  return resolved.name === DEFINE_FEATURE_FLAGS
}

/**
 * The object literal a declaration's value is written as, following one level
 * of indirection.
 *
 * `{ newCheckout }` and `{ newCheckout: flag }` both read naturally with the
 * body declared above, and the flag's `anyOf` is extracted by AST — so the
 * literal has to be found where it was written rather than the property being
 * skipped, which would declare the flag with no capability constraint at all.
 */
const resolveObjectLiteral = (
  property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment,
  checker: ts.TypeChecker
): ts.ObjectLiteralExpression | undefined => {
  if (ts.isShorthandPropertyAssignment(property)) {
    // The name of a shorthand resolves to the property, not to the value it
    // stands for, which is what `getShorthandAssignmentValueSymbol` is for.
    return fromSymbol(
      checker.getShorthandAssignmentValueSymbol(property),
      checker
    )
  }
  const unwrapped = unwrapAs(property.initializer)
  if (ts.isObjectLiteralExpression(unwrapped)) return unwrapped
  if (!ts.isIdentifier(unwrapped)) return undefined
  return fromSymbol(checker.getSymbolAtLocation(unwrapped), checker)
}

const fromSymbol = (
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker
): ts.ObjectLiteralExpression | undefined => {
  const resolved =
    symbol && symbol.flags & ts.SymbolFlags.Alias
      ? (checker.getAliasedSymbol(symbol) ?? symbol)
      : symbol
  for (const declaration of resolved?.declarations ?? []) {
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
      continue
    }
    const initializer = unwrapAs(declaration.initializer)
    if (ts.isObjectLiteralExpression(initializer)) return initializer
  }
  return undefined
}

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
  checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  if (!callsDefineFeatureFlags(node.expression, checker)) {
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
    const shorthand = ts.isShorthandPropertyAssignment(prop)
    if (!shorthand && !ts.isPropertyAssignment(prop)) {
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

    const body = resolveObjectLiteral(prop, checker)

    if (!body) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Feature flag '${name}' must be an object literal, or a variable holding one. ` +
          `'anyOf' is extracted by AST, so a value this file cannot see would declare the flag with no capability constraint.`
      )
      continue
    }

    const anyOf = extractAnyOf(body, name, logger)

    if (anyOf !== undefined && anyOf.length === 0) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Feature flag '${name}' declares 'anyOf: []'. An empty list satisfies ` +
          `nobody: omit 'anyOf' for a pure switch, or name the scopes that reveal it.`
      )
      continue
    }

    const description = getPropertyValue(body, 'description') as string | null

    state.featureFlags.files.add(sourceFile)
    state.featureFlags.definitions.push({
      name,
      description: description || undefined,
      anyOf,
      sourceFile,
    })
  }
}
