import * as ts from 'typescript'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { ErrorCode } from '../error-codes.js'
import type {
  AddWiring,
  InspectorFeature,
  InspectorFeatureEntry,
} from '../types.js'

/**
 * Reads a fully literal expression into a plain value.
 *
 * Used for a `{ scenario, data }` entry's `data`, which is gherkin's
 * `Examples:` row. Anything not literal yields `undefined` — a computed row
 * belongs to the runtime-resolved portion, not to the extracted meta.
 */
const literalValue = (node: ts.Expression): unknown => {
  if (ts.isStringLiteralLike(node)) {
    return node.text
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text)
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text)
  }
  if (ts.isArrayLiteralExpression(node)) {
    const values: unknown[] = []
    for (const element of node.elements) {
      const value = literalValue(element)
      if (value === undefined) {
        return undefined
      }
      values.push(value)
    }
    return values
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value: Record<string, unknown> = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        return undefined
      }
      const key =
        ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
          ? property.name.text
          : undefined
      if (key === undefined) {
        return undefined
      }
      const propertyValue = literalValue(property.initializer)
      if (propertyValue === undefined) {
        return undefined
      }
      value[key] = propertyValue
    }
    return value
  }
  return undefined
}

/**
 * Resolves a scenario reference to the name it is declared under, following an
 * import alias back to the original export so `{ x as y }` records `x`.
 */
const scenarioName = (
  node: ts.Expression,
  checker: ts.TypeChecker
): string | undefined => {
  if (!ts.isIdentifier(node)) {
    return undefined
  }
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) {
    return node.text
  }
  const resolved =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  return resolved.getName() || node.text
}

const getProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | undefined => {
  const property = config.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === name
  )
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined
}

const hasProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): boolean =>
  config.properties.some(
    (p) =>
      (ts.isPropertyAssignment(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isShorthandPropertyAssignment(p)) &&
      ts.isIdentifier(p.name) &&
      p.name.text === name
  )

const stringProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): string | undefined => {
  const value = getProperty(config, name)
  return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

const stringArrayProperty = (
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

const readEntry = (
  element: ts.Expression,
  checker: ts.TypeChecker
): InspectorFeatureEntry | undefined => {
  if (ts.isIdentifier(element)) {
    const scenario = scenarioName(element, checker)
    return scenario ? { scenario } : undefined
  }

  if (ts.isObjectLiteralExpression(element)) {
    const reference = getProperty(element, 'scenario')
    if (!reference) {
      return undefined
    }
    const scenario = scenarioName(reference, checker)
    if (!scenario) {
      return undefined
    }
    const dataNode = getProperty(element, 'data')
    if (!dataNode) {
      return { scenario }
    }
    const data = literalValue(dataNode)
    return data === undefined ? undefined : { scenario, data }
  }

  return undefined
}

/**
 * Inspector for `pikkuFeature()` calls.
 *
 * A feature is the document structure the console renders — its name,
 * description, tags and the order of its scenarios are what a reader sees — so
 * everything the config states literally is extracted here.
 *
 * What cannot be extracted is a scenarios entry that is not literal:
 * `...['stripe', 'google'].map((name) => ({ scenario, data: { name } }))` is
 * ordinary TypeScript, and no AST walk can enumerate it. Those entries are
 * counted in `unresolvedEntries` rather than dropped, and membership for them
 * is resolved at runtime by object identity (`resolveFeatureScenarios`), where
 * the array has actually been evaluated.
 *
 * The export location is recorded either way, which is what the CLI needs to
 * emit its `addFeature(...)` wiring line.
 */
export const addFeature: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuFeature') {
    return
  }

  const { exportedName } = extractFunctionName(node, checker, state.rootDir)

  if (!exportedName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `A pikkuFeature() must be assigned to an export — the export identifier is the feature's id.`
    )
    return
  }

  const feature: InspectorFeature = {
    path: node.getSourceFile().fileName,
    exportedName,
    entries: [],
    unresolvedEntries: 0,
    hasBefore: false,
    hasAfter: false,
  }

  const [config] = node.arguments
  if (config && ts.isObjectLiteralExpression(config)) {
    const name = stringProperty(config, 'name')
    const description = stringProperty(config, 'description')
    const tags = stringArrayProperty(config, 'tags')
    if (name !== undefined) {
      feature.name = name
    }
    if (description !== undefined) {
      feature.description = description
    }
    if (tags !== undefined) {
      feature.tags = tags
    }
    feature.hasBefore = hasProperty(config, 'before')
    feature.hasAfter = hasProperty(config, 'after')

    const scenarios = getProperty(config, 'scenarios')
    if (scenarios && ts.isArrayLiteralExpression(scenarios)) {
      for (const element of scenarios.elements) {
        const entry = readEntry(element, checker)
        if (entry) {
          feature.entries.push(entry)
        } else {
          feature.unresolvedEntries += 1
        }
      }
    }
  }

  state.workflows.featureFiles.set(exportedName, feature)
}
