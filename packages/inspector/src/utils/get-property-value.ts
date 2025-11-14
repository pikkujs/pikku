import * as ts from 'typescript'
import { ErrorCode } from '../error-codes.js'

export const getPropertyValue = (
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): string | string[] | null | boolean => {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === propertyName
  )

  if (property && ts.isPropertyAssignment(property)) {
    const initializer = property.initializer

    // Special handling for 'query', 'tags' -> expect an array of strings
    if (
      ['query', 'tags'].includes(propertyName) &&
      ts.isArrayLiteralExpression(initializer)
    ) {
      const stringArray = initializer.elements
        .map((element) => {
          if (ts.isStringLiteral(element)) {
            return element.text
          }
          return null
        })
        .filter((item) => item !== null) as string[]

      return stringArray.length > 0 ? stringArray : null
    }

    // Special handling for 'errors' -> extract error class names as strings
    if (propertyName === 'errors' && ts.isArrayLiteralExpression(initializer)) {
      const errorArray = initializer.elements
        .filter(ts.isIdentifier)
        .map((element) => element.text)

      return errorArray.length > 0 ? errorArray : null
    }

    // booleans -> true/false
    if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
      return true
    }

    if (initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return false
    }

    // Handle string literals for other properties
    if (
      ts.isStringLiteral(initializer) ||
      ts.isNoSubstitutionTemplateLiteral(initializer)
    ) {
      return initializer.text
    }

    // Handle other initializer types if necessary
    return initializer.getText()
  }

  return null
}

/**
 * Gets the 'tags' property from an object and validates it's an array.
 * Logs a critical error if tags is not an array but still returns the value.
 * @param logger - Optional logger instance; if not provided, uses console.error
 */
export const getPropertyTags = (
  obj: ts.ObjectLiteralExpression,
  wiringType: string,
  wiringName: string | null,
  logger?: { critical: (code: ErrorCode, message: string) => void }
): string[] | undefined => {
  const tagsValue = getPropertyValue(obj, 'tags')

  if (tagsValue !== null && !Array.isArray(tagsValue)) {
    const errorMsg = `${wiringType} '${wiringName}' has invalid 'tags' property - must be an array of strings.`
    if (logger) {
      logger.critical(ErrorCode.INVALID_TAGS_TYPE, errorMsg)
    } else {
      console.error(errorMsg)
    }
    // Return undefined but don't stop processing - error will be caught by the exit handler
  }

  return Array.isArray(tagsValue) ? tagsValue : undefined
}
