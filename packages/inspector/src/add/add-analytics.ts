import * as ts from 'typescript'
import type { InspectorLogger, InspectorState } from '../types.js'

/**
 * Record the project's `pikkuAnalytics` declaration.
 *
 * Only where it is, not what it says: the CLI generates an ingest that imports
 * the declaration and reads `events` off it, so the schema stays a value the
 * project owns rather than something re-derived here.
 *
 * A second declaration is an error rather than a merge — there is one ingest
 * route, so a second union would silently lose to whichever file was visited
 * first.
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
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuAnalytics') {
    return
  }
  if (!ts.isIdentifier(name)) return

  const file = node.getSourceFile().fileName
  const existing = state.analytics
  if (existing && existing.file !== file) {
    logger.error(
      `Found more than one pikkuAnalytics declaration: ${existing.file} and ${file}. A project declares its analytics once.`
    )
    return
  }

  state.analytics = { file, variable: name.text }
}
