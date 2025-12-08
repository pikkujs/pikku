import * as ts from 'typescript'

/**
 * Pattern detection helpers for simple workflow extraction
 */

/**
 * Check if a call expression is workflow.do()
 */
export function isWorkflowDoCall(
  node: ts.CallExpression,
  checker: ts.TypeChecker
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  const propAccess = node.expression
  return (
    propAccess.name.text === 'do' &&
    ts.isIdentifier(propAccess.expression) &&
    propAccess.expression.text === 'workflow'
  )
}

/**
 * Check if a call expression is workflow.sleep()
 */
export function isWorkflowSleepCall(
  node: ts.CallExpression,
  checker: ts.TypeChecker
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  const propAccess = node.expression
  return (
    propAccess.name.text === 'sleep' &&
    ts.isIdentifier(propAccess.expression) &&
    propAccess.expression.text === 'workflow'
  )
}

/**
 * Check if a throw statement throws WorkflowCancelledException
 * Matches: throw new WorkflowCancelledException(...) or throw WorkflowCancelledException(...)
 */
export function isThrowCancelException(node: ts.ThrowStatement): boolean {
  const expr = node.expression
  if (!expr) return false

  // Check for: throw new WorkflowCancelledException(...)
  if (ts.isNewExpression(expr)) {
    if (ts.isIdentifier(expr.expression)) {
      return expr.expression.text === 'WorkflowCancelledException'
    }
  }

  // Check for: throw WorkflowCancelledException(...) - function call style
  if (ts.isCallExpression(expr)) {
    if (ts.isIdentifier(expr.expression)) {
      return expr.expression.text === 'WorkflowCancelledException'
    }
  }

  return false
}

/**
 * Extract the reason string from a throw WorkflowCancelledException statement
 */
export function extractCancelReason(
  node: ts.ThrowStatement,
  checker: ts.TypeChecker
): string | undefined {
  const expr = node.expression
  if (!expr) return undefined

  let args: ts.NodeArray<ts.Expression> | undefined

  if (ts.isNewExpression(expr) && expr.arguments) {
    args = expr.arguments
  } else if (ts.isCallExpression(expr)) {
    args = expr.arguments
  }

  if (args && args.length > 0) {
    const firstArg = args[0]
    if (ts.isStringLiteral(firstArg)) {
      return firstArg.text
    }
    // For template literals or other expressions, return the source text
    return firstArg.getText()
  }

  return undefined
}

/**
 * Check if a call expression is array.filter()
 */
export function isArrayFilter(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  return node.expression.name.text === 'filter'
}

/**
 * Check if a call expression is array.some()
 */
export function isArraySome(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  return node.expression.name.text === 'some'
}

/**
 * Check if a call expression is array.every()
 */
export function isArrayEvery(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  return node.expression.name.text === 'every'
}

/**
 * Check if an expression is Promise.all(array.map(...))
 */
export function isParallelFanout(node: ts.CallExpression): boolean {
  // Promise.all(...)
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  const propAccess = node.expression
  if (
    !ts.isIdentifier(propAccess.expression) ||
    propAccess.expression.text !== 'Promise' ||
    propAccess.name.text !== 'all'
  ) {
    return false
  }

  // Check if argument is array.map(...)
  const arg = node.arguments[0]
  if (!arg || !ts.isCallExpression(arg)) {
    return false
  }

  if (!ts.isPropertyAccessExpression(arg.expression)) {
    return false
  }

  return arg.expression.name.text === 'map'
}

/**
 * Check if an expression is Promise.all([...])
 */
export function isParallelGroup(node: ts.CallExpression): boolean {
  // Promise.all(...)
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }

  const propAccess = node.expression
  if (
    !ts.isIdentifier(propAccess.expression) ||
    propAccess.expression.text !== 'Promise' ||
    propAccess.name.text !== 'all'
  ) {
    return false
  }

  // Check if argument is an array literal
  const arg = node.arguments[0]
  return !!arg && ts.isArrayLiteralExpression(arg)
}

/**
 * Check if a for statement is a valid sequential fanout (for..of)
 */
export function isSequentialFanout(node: ts.ForOfStatement): boolean {
  // Must have const declaration
  if (!ts.isVariableDeclarationList(node.initializer)) {
    return false
  }

  const declList = node.initializer
  if (!(declList.flags & ts.NodeFlags.Const)) {
    return false
  }

  // Must have exactly one declaration
  if (declList.declarations.length !== 1) {
    return false
  }

  return true
}

/**
 * Extract full source path from an expression (e.g., data.memberEmails)
 */
function extractSourcePath(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text
  }

  if (ts.isPropertyAccessExpression(expr)) {
    const base = extractSourcePath(expr.expression)
    if (base) {
      return `${base}.${expr.name.text}`
    }
  }

  return null
}

/**
 * Extract the variable name from a for..of statement
 */
export function extractForOfVariable(
  node: ts.ForOfStatement
): { itemVar: string; sourceVar: string } | null {
  if (!ts.isVariableDeclarationList(node.initializer)) {
    return null
  }

  const decl = node.initializer.declarations[0]
  if (!ts.isIdentifier(decl.name)) {
    return null
  }

  const itemVar = decl.name.text

  // Extract source variable with full path (e.g., data.memberEmails)
  const sourceVar = extractSourcePath(node.expression)

  if (!sourceVar) {
    return null
  }

  return { itemVar, sourceVar }
}

/**
 * Check if a type is an array type
 */
export function isArrayType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Check if it's an array type
  if (checker.isArrayType(type)) {
    return true
  }

  // Check if it's a tuple type
  if (type.flags & ts.TypeFlags.Object) {
    const objectType = type as ts.ObjectType
    if (objectType.objectFlags & ts.ObjectFlags.Tuple) {
      return true
    }
  }

  return false
}

/**
 * Get the source text of a node (for condition expressions)
 */
export function getSourceText(node: ts.Node): string {
  return node.getText().trim()
}
