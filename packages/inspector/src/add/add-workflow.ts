import * as ts from 'typescript'
import {
  getPropertyValue,
  getPropertyTags,
} from '../utils/get-property-value.js'
import { PikkuDocs } from '@pikku/core'
import { AddWiring } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
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

/**
 * Extract workflow.do() calls from function body
 */
function extractWorkflowSteps(
  funcNode: ts.Node,
  checker: ts.TypeChecker,
  logger: any,
  sourceFile: ts.SourceFile
): WorkflowStepMeta[] {
  const steps: WorkflowStepMeta[] = []

  function visit(node: ts.Node) {
    // Look for workflow.do() calls
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'do'
    ) {
      // Check if it's called on 'workflow'
      const object = node.expression.expression
      if (ts.isIdentifier(object) && object.text === 'workflow') {
        const args = node.arguments

        // Must have at least 2 arguments: workflow.do(stepName, rpcName|fn, ...)
        if (args.length >= 2) {
          const stepNameArg = args[0]
          const secondArg = args[1]
          const optionsArg = args[2] // Optional 3rd or 4th argument

          // Extract stepName
          const stepName = extractStringLiteral(stepNameArg, checker)

          // Determine form by checking 2nd argument type
          if (isStringLike(secondArg, checker)) {
            // RPC form: workflow.do(stepName, rpcName, data, options?)
            const rpcName = extractStringLiteral(secondArg, checker)
            const description = extractDescription(optionsArg, checker)

            steps.push({
              type: 'rpc',
              stepName: stepName || '<dynamic>',
              rpcName: rpcName || '<dynamic>',
              description: description || '<dynamic>',
            })

            // Emit warning if stepName is dynamic without description
            if (!stepName && !description) {
              const { line, character } =
                sourceFile.getLineAndCharacterOfPosition(stepNameArg.getStart())
              logger.warning(
                ErrorCode.DYNAMIC_STEP_NAME,
                `Dynamic step name at ${sourceFile.fileName}:${line + 1}:${character + 1}\n\n` +
                  `    await workflow.do(${stepNameArg.getText()}, ...)\n` +
                  `                      ${'^'.repeat(stepNameArg.getText().length)}\n\n` +
                  `    Step names are dynamic and will not appear in generated documentation.\n` +
                  `    Consider adding a description for better observability:\n\n` +
                  `    await workflow.do(${stepNameArg.getText()}, ..., {\n` +
                  `      description: 'Describe what this step does'\n` +
                  `    })`
              )
            }
          } else if (isFunctionLike(secondArg)) {
            // Inline form: workflow.do(stepName, fn, options?)
            const description = extractDescription(optionsArg, checker)

            steps.push({
              type: 'inline',
              stepName: stepName || '<dynamic>',
              description: description || '<dynamic>',
            })

            // Emit warning if stepName is dynamic without description
            if (!stepName && !description) {
              const { line, character } =
                sourceFile.getLineAndCharacterOfPosition(stepNameArg.getStart())
              logger.warning(
                ErrorCode.DYNAMIC_STEP_NAME,
                `Dynamic step name at ${sourceFile.fileName}:${line + 1}:${character + 1}\n\n` +
                  `    await workflow.do(${stepNameArg.getText()}, ...)\n` +
                  `                      ${'^'.repeat(stepNameArg.getText().length)}\n\n` +
                  `    Step names are dynamic and will not appear in generated documentation.\n` +
                  `    Consider adding a description for better observability:\n\n` +
                  `    await workflow.do(${stepNameArg.getText()}, ..., {\n` +
                  `      description: 'Describe what this step does'\n` +
                  `    })`
              )
            }
          } else {
            // Variable reference - try to infer type
            const type = checker.getTypeAtLocation(secondArg)
            const typeString = checker.typeToString(type)

            // If it's a string type, assume RPC form
            if (typeString === 'string' || typeString.includes('string')) {
              const rpcName = extractStringLiteral(secondArg, checker)
              const description = extractDescription(optionsArg, checker)

              steps.push({
                type: 'rpc',
                stepName: stepName || '<dynamic>',
                rpcName: rpcName || '<dynamic>',
                description: description || '<dynamic>',
              })
            } else {
              // Otherwise assume inline form
              const description = extractDescription(optionsArg, checker)

              steps.push({
                type: 'inline',
                stepName: stepName || '<dynamic>',
                description: description || '<dynamic>',
              })
            }
          }
        }
      }
    }

    // Also look for workflow.sleep() calls
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'sleep'
    ) {
      const object = node.expression.expression
      if (ts.isIdentifier(object) && object.text === 'workflow') {
        const args = node.arguments
        if (args.length >= 1) {
          const durationArg = args[0]
          const optionsArg = args[1]

          const duration = extractDuration(durationArg, checker)
          const description = extractDescription(optionsArg, checker)

          steps.push({
            type: 'sleep',
            duration: duration || '<dynamic>',
            description: description || '<dynamic>',
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(funcNode)
  return steps
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
    const executionMode =
      (getPropertyValue(obj, 'executionMode') as 'inline' | 'remote' | null) ||
      'remote'
    const docs = (getPropertyValue(obj, 'docs') as PikkuDocs) || undefined
    const tags = getPropertyTags(obj, 'Workflow', workflowName, logger)

    // --- find the referenced function ---
    const funcInitializer = getPropertyAssignmentInitializer(
      obj,
      'func',
      true,
      checker
    )
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

    if (!workflowName) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `No 'name' provided for workflow function '${pikkuFuncName}'.`
      )
      return
    }

    // --- resolve middleware ---
    const middleware = resolveMiddleware(state, obj, tags, checker)

    // --- track used functions/middleware for service aggregation ---
    state.serviceAggregation.usedFunctions.add(pikkuFuncName)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )

    state.workflows.files.add(node.getSourceFile().fileName)

    // Extract workflow steps from function body
    const sourceFile = node.getSourceFile()
    const steps = extractWorkflowSteps(
      funcInitializer,
      checker,
      logger,
      sourceFile
    )

    state.workflows.meta[workflowName] = {
      pikkuFuncName,
      workflowName,
      executionMode,
      description,
      docs,
      tags,
      middleware,
      meta: {
        name: workflowName,
        description,
        executionMode,
        steps,
        tags,
      },
    }
  }
}
