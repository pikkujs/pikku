import * as ts from 'typescript'
import type { InspectorLogger, InspectorState } from '../types.js'

/**
 * Record where each `defineAnalyticsEvents` declaration is and which names it
 * declares — not what those names validate, since the generated ingest imports
 * the declaration and reads the schemas off it.
 */
export const addAnalytics = (
  logger: InspectorLogger,
  node: ts.Node,
  state: InspectorState
) => {
  if (!ts.isVariableDeclaration(node)) return
  const { initializer, name } = node
  if (!initializer || !ts.isCallExpression(initializer)) return
  const expression = initializer.expression
  if (
    !ts.isIdentifier(expression) ||
    expression.text !== 'defineAnalyticsEvents'
  ) {
    return
  }
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

  const declarations = (state.analytics ??= [])
  const existing = declarations.find(
    (declaration) =>
      declaration.file === file && declaration.variable === name.text
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

  declarations.push({ file, variable: name.text, events })
}
