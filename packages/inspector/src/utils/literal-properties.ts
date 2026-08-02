import * as ts from 'typescript'

/**
 * Readers for object-literal properties that must be statically knowable.
 *
 * Declarations extracted this way are never evaluated — the CLI reads them from
 * source and writes them to JSON that a deployed stage carries without the app.
 * So a computed value is not "unsupported", it is unreadable, and every reader
 * here returns `undefined` for one rather than guessing.
 */

export const getProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | undefined => {
  const property = config.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
  )
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined
}

export const stringProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): string | undefined => {
  const value = getProperty(config, name)
  return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

export const numberProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): number | undefined => {
  const value = getProperty(config, name)
  if (!value) {
    return undefined
  }
  // `-1` parses as a unary minus over a literal, not as a literal. Reading it
  // rather than ignoring it is what lets a negative be *rejected* by the caller
  // instead of silently dropped and defaulted.
  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return -Number(value.operand.text)
  }
  return ts.isNumericLiteral(value) ? Number(value.text) : undefined
}

export const booleanProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): boolean | undefined => {
  const value = getProperty(config, name)
  if (!value) {
    return undefined
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  return undefined
}

/**
 * All-or-nothing: an array with one computed entry reads as unreadable rather
 * than as the entries that happened to be literals. A half-read `roles` or
 * `scopes` array is worse than none — it typechecks, runs, and grants less
 * than the source says.
 */
export const stringArrayProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): string[] | undefined => {
  const value = getProperty(config, name)
  if (!value || !ts.isArrayLiteralExpression(value)) {
    return undefined
  }
  const values = value.elements
    .filter(ts.isStringLiteralLike)
    .map((e) => e.text)
  return values.length === value.elements.length ? values : undefined
}

/** Unwraps `x as const` / `x satisfies T` so a cast is still extracted. */
export const unwrapAs = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    ? unwrapAs(node.expression)
    : node
