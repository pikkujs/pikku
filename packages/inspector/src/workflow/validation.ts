import * as ts from 'typescript'
import { WorkflowStepMeta } from '@pikku/core/workflow'

/**
 * Validation rules for simple workflows
 */

export interface ValidationError {
  message: string
  node: ts.Node
}

/**
 * Validate step name uniqueness within a workflow
 * Exception: duplicate names across mutually exclusive branches are allowed but warned
 */
export function validateStepNameUniqueness(
  steps: WorkflowStepMeta[],
  path: string[] = []
): ValidationError[] {
  const errors: ValidationError[] = []
  const stepNames = new Map<string, string>()

  function collectStepNames(
    steps: WorkflowStepMeta[],
    currentPath: string[]
  ): void {
    for (const step of steps) {
      const pathKey = currentPath.join('.')

      if (step.type === 'branch') {
        // Collect step names in then branch
        collectStepNames(step.branches.then, [...currentPath, 'then'])

        // Collect step names in else branch
        if (step.branches.else) {
          collectStepNames(step.branches.else, [...currentPath, 'else'])
        }
      } else {
        const stepName = step.stepName

        // Check for duplicates on the same path
        const existingPath = stepNames.get(stepName)
        if (existingPath !== undefined) {
          // Check if it's in mutually exclusive branches
          const isMutuallyExclusive =
            (existingPath.includes('.then') && pathKey.includes('.else')) ||
            (existingPath.includes('.else') && pathKey.includes('.then'))

          if (!isMutuallyExclusive) {
            errors.push({
              message: `Duplicate step name "${stepName}" found on path ${pathKey} (previously on ${existingPath})`,
              node: {} as ts.Node, // Will be filled by caller
            })
          }
        } else {
          stepNames.set(stepName, pathKey)
        }
      }
    }
  }

  collectStepNames(steps, path)
  return errors
}

/**
 * Check if a node contains disallowed patterns
 */
export function validateNoDisallowedPatterns(node: ts.Node): ValidationError[] {
  const errors: ValidationError[] = []

  function visit(node: ts.Node) {
    // Check for while loops
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      errors.push({
        message: 'while and do-while loops are not allowed in simple workflows',
        node,
      })
      return
    }

    // Check for for-in loops
    if (
      ts.isForInStatement(node) ||
      (ts.isForStatement(node) && !ts.isForOfStatement(node))
    ) {
      errors.push({
        message:
          'for and for-in loops are not allowed in simple workflows. Use for-of instead.',
        node,
      })
      return
    }

    // Check for inline workflow.do
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression
        if (
          propAccess.name.text === 'do' &&
          ts.isIdentifier(propAccess.expression) &&
          propAccess.expression.text === 'workflow'
        ) {
          // Check if second argument is a function
          const secondArg = node.arguments[1]
          if (
            secondArg &&
            (ts.isArrowFunction(secondArg) ||
              ts.isFunctionExpression(secondArg))
          ) {
            errors.push({
              message:
                'Inline workflow.do with function argument is not allowed in simple workflows. Use RPC form instead.',
              node,
            })
            return
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(node)
  return errors
}

/**
 * Validate that all workflow.do calls are awaited
 */
export function validateAwaitedCalls(node: ts.Node): ValidationError[] {
  const errors: ValidationError[] = []

  function visit(node: ts.Node, parentIsAwait: boolean = false) {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression
        if (
          (propAccess.name.text === 'do' || propAccess.name.text === 'sleep') &&
          ts.isIdentifier(propAccess.expression) &&
          propAccess.expression.text === 'workflow'
        ) {
          if (!parentIsAwait) {
            errors.push({
              message: `workflow.${propAccess.name.text}() must be awaited`,
              node,
            })
          }
          return
        }
      }
    }

    if (ts.isAwaitExpression(node)) {
      // Mark child as awaited
      ts.forEachChild(node.expression, (child) => visit(child, true))
    } else {
      ts.forEachChild(node, (child) => visit(child, false))
    }
  }

  visit(node)
  return errors
}

/**
 * Combine all validation errors into a single error message
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return ''
  }

  return errors.map((err) => `- ${err.message}`).join('\n')
}
