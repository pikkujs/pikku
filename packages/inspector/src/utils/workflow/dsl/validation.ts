import * as ts from 'typescript'

/**
 * Validation rules for simple workflows
 */

export interface ValidationError {
  message: string
  node: ts.Node
}

/**
 * Check if a node contains only allowed patterns
 *
 * Allowed patterns:
 * - VariableStatement (const/let declarations)
 * - ExpressionStatement (await workflow.do, await workflow.sleep, await Promise.all)
 * - IfStatement (branches)
 * - SwitchStatement (switch/case)
 * - ForOfStatement (sequential fanout)
 * - ReturnStatement
 * - ThrowStatement (for WorkflowCancelledException)
 * - Block (containers)
 */
export function validateNoDisallowedPatterns(node: ts.Node): ValidationError[] {
  const errors: ValidationError[] = []

  function visitBlock(block: ts.Block) {
    for (const statement of block.statements) {
      if (
        ts.isVariableStatement(statement) ||
        ts.isExpressionStatement(statement) ||
        ts.isIfStatement(statement) ||
        ts.isSwitchStatement(statement) ||
        ts.isForOfStatement(statement) ||
        ts.isReturnStatement(statement) ||
        ts.isThrowStatement(statement)
      ) {
        // Allowed statement type - recurse into it
        visitNode(statement)
      } else {
        // Unknown/disallowed statement type
        const nodeType = ts.SyntaxKind[statement.kind]
        errors.push({
          message: `Statement type '${nodeType}' is not allowed in simple workflows. Allowed: const/let, if/else, switch/case, for..of, return, throw, and workflow calls. If this should be supported, please report the node type: ${nodeType}`,
          node: statement,
        })
      }
    }
  }

  function visitNode(node: ts.Node) {
    // Disallow while and do-while
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      errors.push({
        message: 'while and do-while loops are not allowed in simple workflows',
        node,
      })
      return
    }

    // Disallow for and for-in loops
    if (ts.isForInStatement(node) || ts.isForStatement(node)) {
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

    // Recurse into blocks
    if (ts.isBlock(node)) {
      visitBlock(node)
    } else {
      ts.forEachChild(node, visitNode)
    }
  }

  visitNode(node)
  return errors
}

/**
 * Validate that all workflow.do calls are awaited
 */
export function validateAwaitedCalls(node: ts.Node): ValidationError[] {
  const errors: ValidationError[] = []

  function visit(
    node: ts.Node,
    parentIsAwait: boolean = false,
    insidePromiseAll: boolean = false
  ) {
    // Check if this is Promise.all(...) first, before checking for workflow calls
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const propAccess = node.expression
      if (
        propAccess.name.text === 'all' &&
        ts.isIdentifier(propAccess.expression) &&
        propAccess.expression.text === 'Promise'
      ) {
        // console.log('[DEBUG] Found Promise.all, setting insidePromiseAll=true')
        // Visit children with insidePromiseAll = true
        ts.forEachChild(node, (child) => visit(child, parentIsAwait, true))
        return
      }
    }

    // Now check for workflow calls
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression
        if (
          (propAccess.name.text === 'do' || propAccess.name.text === 'sleep') &&
          ts.isIdentifier(propAccess.expression) &&
          propAccess.expression.text === 'workflow'
        ) {
          if (!parentIsAwait && !insidePromiseAll) {
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
      // Visit the expression itself with parentIsAwait=true
      visit(node.expression, true, insidePromiseAll)
    } else {
      ts.forEachChild(node, (child) => visit(child, false, insidePromiseAll))
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
