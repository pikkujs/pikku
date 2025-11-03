import * as ts from 'typescript'

/**
 * Extract string literal value from a TypeScript node
 * Handles string literals, template literals, and constant variable references
 */
export function extractStringLiteral(
  node: ts.Node,
  checker: ts.TypeChecker
): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  // Try to evaluate constant expressions
  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol && symbol.valueDeclaration) {
      if (
        ts.isVariableDeclaration(symbol.valueDeclaration) &&
        symbol.valueDeclaration.initializer
      ) {
        return extractStringLiteral(
          symbol.valueDeclaration.initializer,
          checker
        )
      }
    }
  }
  return null
}

/**
 * Check if node is string-like (string literal or template expression)
 */
export function isStringLike(node: ts.Node, _checker: ts.TypeChecker): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return true
  }
  // Check if it's a template string with substitutions
  if (ts.isTemplateExpression(node)) {
    return true
  }
  return false
}

/**
 * Check if node is function-like (arrow, function expression, or function declaration)
 */
export function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node)
  )
}

/**
 * Extract number literal value from a node
 */
export function extractNumberLiteral(node: ts.Node): number | null {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text)
  }
  return null
}

/**
 * Extract a property value from an object literal expression
 * Returns the extracted value or null if not found/cannot extract
 */
export function extractPropertyString(
  objNode: ts.ObjectLiteralExpression,
  propertyName: string,
  checker: ts.TypeChecker
): string | null {
  for (const prop of objNode.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === propertyName
    ) {
      return extractStringLiteral(prop.initializer, checker)
    }
  }
  return null
}
