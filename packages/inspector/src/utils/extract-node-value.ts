import * as ts from 'typescript'

/**
 * Extract string literal value from a TypeScript node.
 * Handles string literals, template literals (including placeholders),
 * and constant variable references.
 */
export function extractStringLiteral(
  node: ts.Node,
  checker: ts.TypeChecker
): string {
  if (ts.isStringLiteral(node)) {
    return node.text
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  if (ts.isTemplateExpression(node)) {
    // reconstruct: `head + ${expr} + middle + ${expr} + tail`
    let result = node.head.text
    for (const span of node.templateSpans) {
      const exprText = span.expression.getText()
      result += '${' + exprText + '}' + span.literal.text
    }
    return result
  }

  // Try to evaluate constant identifiers
  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (
      symbol?.valueDeclaration &&
      ts.isVariableDeclaration(symbol.valueDeclaration)
    ) {
      const init = symbol.valueDeclaration.initializer
      if (init) {
        return extractStringLiteral(init, checker)
      }
    }
  }

  throw new Error('Unable to extract string literal from node')
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

/**
 * Extract description from options object
 */
export function extractDescription(
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
export function extractDuration(
  node: ts.Node,
  checker: ts.TypeChecker
): string | number | null {
  const numValue = extractNumberLiteral(node)
  if (numValue !== null) {
    return numValue
  }
  return extractStringLiteral(node, checker)
}
