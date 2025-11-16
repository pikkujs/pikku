import * as ts from 'typescript'
import {
  getPropertyValue,
  getPropertyTags,
} from '../utils/get-property-value.js'
import { PikkuDocs } from '@pikku/core'
import { AddWiring, InspectorState } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import {
  getPropertyAssignmentInitializer,
  resolveFunctionDeclaration,
} from '../utils/type-utils.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'
import { ErrorCode } from '../error-codes.js'
import { WorkflowStepMeta } from '@pikku/core/workflow'
import {
  extractStringLiteral,
  extractNumberLiteral,
  extractPropertyString,
  isStringLike,
  isFunctionLike,
} from '../utils/extract-node-value.js'
import { extractSimpleWorkflow } from '../workflow/extract-simple-workflow.js'

/**
 * Detect which wrapper function is being used (pikkuWorkflowFunc or pikkuSimpleWorkflowFunc)
 */
function detectWrapperType(funcInitializer: ts.Node): 'simple' | 'regular' {
  // Check if the function is wrapped in pikkuSimpleWorkflowFunc
  let current: ts.Node | undefined = funcInitializer

  while (current) {
    if (ts.isCallExpression(current)) {
      const expr = current.expression
      if (ts.isIdentifier(expr)) {
        if (expr.text === 'pikkuSimpleWorkflowFunc') {
          return 'simple'
        }
        if (expr.text === 'pikkuWorkflowFunc') {
          return 'regular'
        }
      }
    }

    // Check parent
    if (current.parent) {
      current = current.parent
    } else {
      break
    }
  }

  return 'regular'
}

/**
 * Scan for workflow.do() and workflow.sleep() calls to extract workflow steps
 */
function getWorkflowInvocations(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  workflowName: string,
  steps: WorkflowStepMeta[]
) {
  // Look for property access expressions: workflow.do or workflow.sleep
  if (ts.isPropertyAccessExpression(node)) {
    const { name } = node

    // Check if this is accessing 'do' or 'sleep' property
    if (name.text === 'do' || name.text === 'sleep') {
      // Check if the parent is a call expression
      const parent = node.parent
      if (ts.isCallExpression(parent) && parent.expression === node) {
        const args = parent.arguments

        if (name.text === 'do' && args.length >= 2) {
          // workflow.do(stepName, rpcName|fn, data?, options?)
          const stepNameArg = args[0]
          const secondArg = args[1]
          const optionsArg =
            args.length >= 3 ? args[args.length - 1] : undefined

          const stepName = extractStringLiteral(stepNameArg, checker)
          const description =
            extractDescription(optionsArg, checker) ?? undefined

          // Determine form by checking 2nd argument type
          if (isStringLike(secondArg, checker)) {
            // RPC form: workflow.do(stepName, rpcName, data, options?)
            const rpcName = extractStringLiteral(secondArg, checker)
            steps.push({
              type: 'rpc',
              stepName,
              rpcName,
              description,
            })
            state.rpc.invokedFunctions.add(rpcName)
          } else if (isFunctionLike(secondArg)) {
            // Inline form: workflow.do(stepName, fn, options?)
            steps.push({
              type: 'inline',
              stepName: stepName || '<dynamic>',
              description: description || '<dynamic>',
            })
          }
        } else if (name.text === 'sleep' && args.length >= 2) {
          // workflow.sleep(stepName, duration)
          const stepNameArg = args[0]
          const durationArg = args[1]

          const stepName = extractStringLiteral(stepNameArg, checker)
          const duration = extractDuration(durationArg, checker)

          steps.push({
            type: 'sleep',
            stepName: stepName || '<dynamic>',
            duration: duration || '<dynamic>',
          })
        }
      }
    }
  }

  // Don't recurse into nested functions - only look at top-level workflow calls
  ts.forEachChild(node, (child) => {
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child)
    ) {
      return
    }
    getWorkflowInvocations(child, checker, state, workflowName, steps)
  })
}

/**
 * Extract description from options object
 */
function extractDescription(
  optionsNode: ts.Node | undefined,
  checker: ts.TypeChecker
): string | null {
  if (!optionsNode || !ts.isObjectLiteralExpression(optionsNode)) {
    return null
  }
  return extractPropertyString(optionsNode, 'description', checker)
}

/**
 * Extract duration value (number or string)
 */
function extractDuration(
  node: ts.Node,
  checker: ts.TypeChecker
): string | number | null {
  const numValue = extractNumberLiteral(node)
  if (numValue !== null) {
    return numValue
  }
  return extractStringLiteral(node, checker)
}

/**
 * Inspector for wireWorkflow() calls
 * Detects workflow registration and extracts metadata
 */
export const addWorkflow: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to wireWorkflow
  if (!ts.isIdentifier(expression) || expression.text !== 'wireWorkflow') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const workflowName = getPropertyValue(obj, 'name') as string | null
    const description = getPropertyValue(obj, 'description') as
      | string
      | undefined
    const docs = (getPropertyValue(obj, 'docs') as PikkuDocs) || undefined
    const tags = getPropertyTags(obj, 'Workflow', workflowName, logger)

    // --- find the referenced function ---
    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )

    if (!workflowName) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Wasn't able to determine 'name' property for workflow wiring.`
      )
      return
    }

    if (!funcInitializer) {
      logger.critical(
        ErrorCode.MISSING_FUNC,
        `No valid 'func' property for workflow '${workflowName}'.`
      )
      return
    }

    const pikkuFuncName = extractFunctionName(
      funcInitializer,
      checker,
      state.rootDir
    ).pikkuFuncName

    // --- resolve middleware ---
    const middleware = resolveMiddleware(state, obj, tags, checker)

    // --- track used functions/middleware for service aggregation ---
    state.serviceAggregation.usedFunctions.add(pikkuFuncName)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )

    state.workflows.files.add(node.getSourceFile().fileName)

    // Detect wrapper type
    const wrapperType = detectWrapperType(funcInitializer)
    const resolvedFunc = resolveFunctionDeclaration(funcInitializer, checker)

    let steps: WorkflowStepMeta[] = []
    let simple: boolean | undefined = undefined

    // Try simple workflow extraction first if using pikkuSimpleWorkflowFunc or pikkuWorkflowFunc
    if (
      resolvedFunc &&
      (wrapperType === 'simple' || wrapperType === 'regular')
    ) {
      const result = extractSimpleWorkflow(funcInitializer, checker)

      if (result.status === 'ok' && result.steps) {
        // Simple extraction succeeded
        steps = result.steps
        simple = true
      } else {
        // Simple extraction failed
        if (wrapperType === 'simple') {
          // For pikkuSimpleWorkflowFunc, this is a critical error
          logger.critical(
            ErrorCode.INVALID_SIMPLE_WORKFLOW,
            `Workflow '${workflowName}' uses pikkuSimpleWorkflowFunc but does not conform to simple workflow DSL:\n${result.reason || 'Unknown error'}`
          )
          return
        } else {
          // For pikkuWorkflowFunc, fall back to basic extraction
          logger.warn(
            `Workflow '${workflowName}' could not be extracted as simple workflow: ${result.reason || 'Unknown error'}. Falling back to basic extraction.`
          )
          simple = false
          getWorkflowInvocations(
            resolvedFunc,
            checker,
            state,
            workflowName,
            steps
          )
        }
      }
    } else if (resolvedFunc) {
      // Fallback to basic extraction
      getWorkflowInvocations(resolvedFunc, checker, state, workflowName, steps)
    }

    state.workflows.meta[workflowName] = {
      pikkuFuncName,
      workflowName,
      description,
      docs,
      tags,
      middleware,
      steps,
      simple,
    }
  }
}
