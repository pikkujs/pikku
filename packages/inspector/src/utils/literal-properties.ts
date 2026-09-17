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

/**
 * Reads a property whose value is a JSON-shaped object literal — nested
 * objects, arrays, strings, numbers, booleans and `null`.
 *
 * All-or-nothing for the same reason as `stringArrayProperty`, and then some:
 * these values are handed to a provider verbatim, so a half-read
 * `providerOptions` would send the model a *different* configuration from the
 * one in source rather than none. `undefined` for anything computed lets the
 * caller say so instead of guessing.
 */
export const jsonObjectProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): Record<string, unknown> | undefined => {
  const value = getProperty(config, name)
  if (!value) {
    return undefined
  }
  const read = readJsonValue(value)
  return read.ok && isPlainRecord(read.value) ? read.value : undefined
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type JsonRead = { ok: true; value: unknown } | { ok: false }

const UNREADABLE: JsonRead = { ok: false }

const readJsonValue = (node: ts.Expression): JsonRead => {
  const value = unwrapAs(node)

  if (ts.isStringLiteralLike(value)) {
    return { ok: true, value: value.text }
  }
  if (ts.isNumericLiteral(value)) {
    return { ok: true, value: Number(value.text) }
  }
  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return { ok: true, value: -Number(value.operand.text) }
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return { ok: true, value: true }
  }
  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return { ok: true, value: false }
  }
  if (value.kind === ts.SyntaxKind.NullKeyword) {
    return { ok: true, value: null }
  }
  if (ts.isArrayLiteralExpression(value)) {
    const entries: unknown[] = []
    for (const element of value.elements) {
      const read = readJsonValue(element)
      if (!read.ok) {
        return UNREADABLE
      }
      entries.push(read.value)
    }
    return { ok: true, value: entries }
  }
  if (ts.isObjectLiteralExpression(value)) {
    const record: Record<string, unknown> = {}
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) {
        return UNREADABLE
      }
      const key = ts.isIdentifier(property.name)
        ? property.name.text
        : ts.isStringLiteralLike(property.name)
          ? property.name.text
          : ts.isNumericLiteral(property.name)
            ? property.name.text
            : null
      if (key === null) {
        return UNREADABLE
      }
      const read = readJsonValue(property.initializer)
      if (!read.ok) {
        return UNREADABLE
      }
      record[key] = read.value
    }
    return { ok: true, value: record }
  }

  return UNREADABLE
}
