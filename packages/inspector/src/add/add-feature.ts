import * as ts from 'typescript'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { ErrorCode } from '../error-codes.js'
import type { AddWiring } from '../types.js'

/**
 * Inspector for `pikkuFeature()` calls.
 *
 * Unlike every other wiring, a feature's *contents* are deliberately not
 * extracted here. Its `scenarios` array is ordinary TypeScript — the whole
 * point of the primitive is that
 * `...['stripe', 'google'].map((name) => ({ scenario, data: { name } }))`
 * works — and no AST walk can enumerate that. Membership is therefore resolved
 * at runtime by object identity (`resolveFeatureScenarios`), where the array
 * has actually been evaluated.
 *
 * So all this records is where the feature is exported from, which is what the
 * CLI needs to emit its `addFeature(...)` wiring line.
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

  state.workflows.featureFiles.set(exportedName, {
    path: node.getSourceFile().fileName,
    exportedName,
  })
}
