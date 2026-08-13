import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { ErrorCode } from '../error-codes.js'

/**
 * `pikkuAIScorer` grades in code and `pikkuAIJudge` grades with a model, which
 * is the whole difference between the two lanes — so the lane is read off which
 * constructor was called rather than from a field an author could contradict.
 */
const LANES: Record<string, 'fast' | 'slow'> = {
  pikkuAIScorer: 'fast',
  pikkuAIJudge: 'slow',
}

export const addAIScorer: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) return

  const expression = node.expression
  if (!ts.isIdentifier(expression)) return

  const lane = LANES[expression.text]
  if (!lane) return

  const firstArg = node.arguments[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) return

  const obj = firstArg
  const { exportedName } = extractFunctionName(node, checker, state.rootDir)

  const nameValue = getPropertyValue(obj, 'name') as string | null
  if (!nameValue) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      "AI scorer is missing the required 'name' property."
    )
    return
  }

  const description = getPropertyValue(obj, 'description') as string | null
  if (!description) {
    logger.critical(
      ErrorCode.MISSING_DESCRIPTION,
      `AI scorer '${nameValue}' is missing the required 'description' property.`
    )
    return
  }

  const sampleRateValue = getPropertyValue(obj, 'sampleRate') as number | null
  if (
    sampleRateValue !== null &&
    (sampleRateValue < 0 || sampleRateValue > 1)
  ) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `AI scorer '${nameValue}' has a sampleRate of ${sampleRateValue} — it is the fraction of live runs to grade, so it must be between 0 and 1.`
    )
    return
  }

  const requiresReference =
    (getPropertyValue(obj, 'requiresReference') as boolean | null) ?? false

  const scorerKey = exportedName || nameValue

  if (exportedName) {
    state.scorers.files.set(scorerKey, {
      path: node.getSourceFile().fileName,
      exportedName,
    })
  }

  state.scorers.scorersMeta[scorerKey] = {
    name: nameValue,
    description,
    lane,
    sampleRate: sampleRateValue ?? 1,
    requiresReference,
    sourceFile: node.getSourceFile().fileName,
    exportedName: exportedName || undefined,
  }
}
