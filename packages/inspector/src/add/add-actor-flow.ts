import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import type { ActorFlowApprovalPolicy } from '@pikku/core/actor-flow'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { ErrorCode } from '../error-codes.js'
import {
  getCommonWireMetaData,
  getPropertyValue,
} from '../utils/get-property-value.js'
import { extractActorFromOptions } from '../utils/workflow/dsl/patterns.js'

const APPROVAL_POLICIES = new Set<ActorFlowApprovalPolicy>([
  'in-persona',
  'always',
  'never',
])

/** Read a required string-literal property, or undefined if absent/non-literal. */
function getStringProp(
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): string | undefined {
  const value = getPropertyValue(obj, propertyName)
  return typeof value === 'string' ? value : undefined
}

/** True when the config declares a property (assignment, shorthand or method). */
function hasProperty(
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): boolean {
  return obj.properties.some(
    (prop) =>
      (ts.isPropertyAssignment(prop) ||
        ts.isShorthandPropertyAssignment(prop) ||
        ts.isMethodDeclaration(prop)) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propertyName
  )
}

/**
 * Inspector for `pikkuActorFlow({ actor, agent, task, evaluate, verify })`.
 *
 * An actor flow is an LLM-driven actor that plays a configured persona and
 * converses with a target Pikku AI agent — distinct from a user flow's
 * deterministic actor RPC steps, so it gets its own meta rather than riding the
 * workflow tables.
 */
export const addActorFlow: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuActorFlow') {
    return
  }

  const firstArg = node.arguments[0]
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }

  const { pikkuFuncId, name, exportedName } = extractFunctionName(
    node,
    checker,
    state.rootDir
  )
  const flowName = exportedName || name
  if (!flowName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `Could not determine actor flow name from export.`
    )
    return
  }

  const metadata = getCommonWireMetaData(
    firstArg,
    'ActorFlow',
    flowName,
    logger,
    checker
  )
  if (metadata.disabled) return

  const actor = extractActorFromOptions(firstArg)
  const agent = getStringProp(firstArg, 'agent')
  const task = getStringProp(firstArg, 'task')
  const evaluate = getStringProp(firstArg, 'evaluate')

  const missing = [
    actor ? null : `actor (must be { actor: actors.x })`,
    agent ? null : `agent (a string literal agent name)`,
    task ? null : `task (a string literal)`,
    evaluate ? null : `evaluate (a string literal)`,
  ].filter((m): m is string => m !== null)

  if (missing.length > 0) {
    logger.critical(
      ErrorCode.ACTOR_FLOW_INVALID,
      `Actor flow '${flowName}' is missing required fields: ${missing.join(', ')}.`
    )
    return
  }

  const approvalsRaw = getStringProp(firstArg, 'approvals')
  const approvals =
    approvalsRaw &&
    APPROVAL_POLICIES.has(approvalsRaw as ActorFlowApprovalPolicy)
      ? (approvalsRaw as ActorFlowApprovalPolicy)
      : undefined

  if (exportedName) {
    state.actorFlows.files.set(pikkuFuncId, {
      path: node.getSourceFile().fileName,
      exportedName,
    })
  }

  state.actorFlows.meta[flowName] = {
    name: flowName,
    actor: actor!,
    agent: agent!,
    task: task!,
    evaluate: evaluate!,
    approvals,
    hasVerify: hasProperty(firstArg, 'verify') ? true : undefined,
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
  }
}
