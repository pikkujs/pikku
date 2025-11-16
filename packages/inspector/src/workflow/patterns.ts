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

  // Extract source variable
  let sourceVar: string | null = null
  if (ts.isIdentifier(node.expression)) {
    sourceVar = node.expression.text
  } else if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression)
  ) {
    // Handle data.memberEmails
    sourceVar = node.expression.expression.text
  }

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
