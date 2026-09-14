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
  // Only an import can be pikku's. A file's own helper of the same name
  // resolves to a symbol whose `.name` matches, so resolving without this
  // claims it — the mirror of what matching on the callee's text misses.
  if (!(symbol.flags & ts.SymbolFlags.Alias)) return false
  const resolved = checker.getAliasedSymbol(symbol) ?? symbol
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
 * The `z.object({ ... })` an event's schema is built from, wherever it sits in
 * a chain — `z.object({}).strict()` and `z.object({}).describe('…')` are both
 * ordinary things to write, and the shape is on the innermost call either way.
 */
const findObjectShape = (
  expression: ts.Expression
): ts.ObjectLiteralExpression | undefined => {
  let current: ts.Expression | undefined = expression
  while (current && ts.isCallExpression(current)) {
    const callee = current.expression
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'object'
    ) {
      const [shape] = current.arguments
      if (shape && ts.isObjectLiteralExpression(shape)) return shape
    }
    current = ts.isPropertyAccessExpression(callee)
      ? callee.expression
      : undefined
  }
  return undefined
}

/**
 * An event's props, as source text rather than a resolved type — `z.string()`
 * is what the declaration says and what a reader recognises, and resolving it
 * would mean type-checking a third-party generic to render one table cell.
 *
 * Absent for a schema pikku cannot read the shape off (a shared const, a union,
 * a vendor that is not zod). The catalog renders nothing rather than guessing.
 */
const readEventShape = (
  initializer: ts.Expression
): Record<string, string> | undefined => {
  const shape = findObjectShape(initializer)
  if (!shape) return undefined
  const props: Record<string, string> = {}
  for (const property of shape.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = property.name
    const propName = ts.isIdentifier(key)
      ? key.text
      : ts.isStringLiteral(key)
        ? key.text
        : undefined
    if (propName === undefined) continue
    props[propName] = property.initializer.getText().replace(/\s+/g, ' ')
  }
  return props
}

/**
 * Record where each `defineAnalyticsEvents` declaration is, which names it
 * declares, and the shape each name validates — the names drive the generated
 * ingest, which reads the schemas off the declaration itself; the shapes are
 * read here only so the console can show what an event carries.
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
  const props: Record<string, Record<string, string>> = {}
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
    const shape = readEventShape(property.initializer)
    if (shape) props[eventName] = shape
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

  // A declaration whose shapes the inspector could not read carries no props,
  // which the meta says by leaving the field off rather than by an empty object.
  const readProps = Object.keys(props).length > 0 ? props : undefined

  const declarations = (state.analytics ??= [])
  const existing = declarations.find(
    (declaration) =>
      declaration.file === file && declaration.variable === variable
  )
  if (existing) {
    existing.events = events
    if (readProps) existing.props = readProps
    else delete existing.props
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

  declarations.push(
    readProps
      ? { file, variable, events, props: readProps }
      : { file, variable, events }
  )
}
