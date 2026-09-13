import * as ts from 'typescript'
import type { InspectorLogger, InspectorState } from '../types.js'
import { isNamedExport } from '../utils/extract-function-name.js'

const DEFINE_ANALYTICS_EVENTS = 'defineAnalyticsEvents'

/**
 * A call is the pikku one when the symbol it resolves to is, whatever the file
 * chose to call it locally — `import { defineAnalyticsEvents as declare }` is
 * an ordinary thing to write, and matching on the callee's text alone both
 * misses that and claims a same-named local helper.
 */
const callsDefineAnalyticsEvents = (
  expression: ts.Expression,
  checker: ts.TypeChecker
): boolean => {
  if (!ts.isIdentifier(expression)) return false
  const symbol = checker.getSymbolAtLocation(expression)
  if (!symbol) return expression.text === DEFINE_ANALYTICS_EVENTS
  // An import specifier names what it imported even when the module itself
  // does not resolve, which is every project whose deps are not installed yet.
  const declaration = symbol.declarations?.[0]
  if (declaration && ts.isImportSpecifier(declaration)) {
    return (
      (declaration.propertyName ?? declaration.name).text ===
      DEFINE_ANALYTICS_EVENTS
    )
  }
  const resolved =
    symbol.flags & ts.SymbolFlags.Alias
      ? (checker.getAliasedSymbol(symbol) ?? symbol)
      : symbol
  return resolved.name === DEFINE_ANALYTICS_EVENTS
}

/**
 * The name the generated ingest has to import the declaration by — which is
 * the name the module exports it under, not the name of the const. A module
 * that keeps the declaration to itself has no such name, so it is refused here
 * rather than emitted into an ingest that cannot compile.
 */
const exportedName = (
  declaration: ts.VariableDeclaration,
  name: ts.Identifier,
  checker: ts.TypeChecker
): string | undefined => {
  const moduleSymbol = checker.getSymbolAtLocation(declaration.getSourceFile())
  const declarationSymbol = checker.getSymbolAtLocation(name)
  if (!moduleSymbol || !declarationSymbol) {
    return isNamedExport(declaration, checker) ? name.text : undefined
  }
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const resolved =
      exported.flags & ts.SymbolFlags.Alias
        ? (checker.getAliasedSymbol(exported) ?? exported)
        : exported
    if (resolved === declarationSymbol) return exported.name
  }
  return undefined
}

/**
 * Record where each `defineAnalyticsEvents` declaration is and which names it
 * declares — not what those names validate, since the generated ingest imports
 * the declaration and reads the schemas off it.
 */
export const addAnalytics = (
  logger: InspectorLogger,
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState
) => {
  if (!ts.isVariableDeclaration(node)) return
  const { initializer, name } = node
  if (!initializer || !ts.isCallExpression(initializer)) return
  if (!callsDefineAnalyticsEvents(initializer.expression, checker)) return
  if (!ts.isIdentifier(name)) return

  const file = node.getSourceFile().fileName
  const [argument] = initializer.arguments
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    logger.error(
      `defineAnalyticsEvents in ${file} must be called with an object literal keyed by event name, so the generated ingest knows what to union.`
    )
    return
  }

  const events: string[] = []
  for (const property of argument.properties) {
    // `{ page_viewed }` names the event in the shorthand's own identifier.
    if (ts.isShorthandPropertyAssignment(property)) {
      events.push(property.name.text)
      continue
    }
    if (!ts.isPropertyAssignment(property)) continue
    const key = property.name
    const eventName = ts.isIdentifier(key)
      ? key.text
      : ts.isStringLiteral(key)
        ? key.text
        : undefined
    if (eventName === undefined) continue
    events.push(eventName)
  }

  if (events.length === 0) {
    logger.error(
      `defineAnalyticsEvents in ${file} declares no events. Remove it or add one.`
    )
    return
  }

  const variable = exportedName(node, name, checker)
  if (!variable) {
    logger.error(
      `defineAnalyticsEvents in ${file} is assigned to '${name.text}', which the module does not export. The generated ingest imports every declaration by name, so export it.`
    )
    return
  }

  const declarations = (state.analytics ??= [])
  const existing = declarations.find(
    (declaration) =>
      declaration.file === file && declaration.variable === variable
  )
  if (existing) {
    existing.events = events
    return
  }

  for (const eventName of events) {
    const declaredIn = declarations.find((declaration) =>
      declaration.events.includes(eventName)
    )
    if (declaredIn) {
      logger.error(
        `Analytics event '${eventName}' is declared twice: ${declaredIn.file} and ${file}. An event name belongs to one declaration.`
      )
      return
    }
  }

  declarations.push({ file, variable, events })
}
