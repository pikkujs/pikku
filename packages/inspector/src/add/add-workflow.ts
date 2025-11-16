import * as ts from 'typescript'
import { AddWiring, InspectorState } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { extractFunctionNode } from '../utils/extract-function-node.js'
import { ErrorCode } from '../error-codes.js'
import { WorkflowStepMeta } from '@pikku/core/workflow'
import {
  extractStringLiteral,
  isStringLike,
  isFunctionLike,
  extractDescription,
  extractDuration,
} from '../utils/extract-node-value.js'
import { extractSimpleWorkflow } from '../workflow/extract-simple-workflow.js'

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
 * Inspector for pikkuWorkflow() and pikkuSimpleWorkflow() calls
 * Detects workflow registration and extracts metadata
 */
export const addWorkflow: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  if (!ts.isIdentifier(expression)) {
    return
  }

  let wrapperType: 'simple' | 'regular' | null = null
  if (expression.text === 'pikkuWorkflowFunc') {
    wrapperType = 'regular'
  } else if (expression.text === 'pikkuSimpleWorkflowFunc') {
    wrapperType = 'simple'
  } else {
    return
  }

  if (!firstArg) {
    return
  }

  // Extract workflow name and metadata using same logic as add-functions
  const { pikkuFuncName, name, exportedName } = extractFunctionName(
    node,
    checker,
    state.rootDir
  )

  const workflowName = exportedName || name

  if (!workflowName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `Could not determine workflow name from export.`
    )
    return
  }

  // Extract the function node (either direct function or from config.func)
  const { funcNode, resolvedFunc } = extractFunctionNode(firstArg, checker)

  // Validate that we got a valid function
  if (
    ts.isObjectLiteralExpression(firstArg) &&
    (!funcNode || funcNode === firstArg)
  ) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for workflow '${workflowName}'.`
    )
    return
  }

  // Track workflow file for wiring generation
  if (exportedName) {
    state.workflows.files.set(pikkuFuncName, {
      path: node.getSourceFile().fileName,
      exportedName,
    })
  }

  let steps: WorkflowStepMeta[] = []
  let simple: boolean | undefined = undefined

  // Try simple workflow extraction first
  // Pass the whole CallExpression node so findWorkflowFunction can find the arrow function
  if (resolvedFunc) {
    const result = extractSimpleWorkflow(node, checker)

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
        logger.debug(
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
    steps,
    simple,
  }
}
