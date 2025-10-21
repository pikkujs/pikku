import { PikkuDocs } from '@pikku/core'
import * as ts from 'typescript'
import { ErrorCode } from '../error-codes.js'

export const getPropertyValue = (
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): string | string[] | null | PikkuDocs | boolean => {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === propertyName
  )

  if (property && ts.isPropertyAssignment(property)) {
    const initializer = property.initializer

    // Special handling for 'query' -> expect an array of strings
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
        .filter((item) => item !== null) as string[] // Filter non-null and assert type

      return stringArray.length > 0 ? stringArray : null
    }

    // Special handling for 'docs' -> expect RouteDocs
    if (propertyName === 'docs' && ts.isObjectLiteralExpression(initializer)) {
      const docs: PikkuDocs = {}

      initializer.properties.forEach((prop) => {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const propName = prop.name.text

          if (propName === 'summary' && ts.isStringLiteral(prop.initializer)) {
            docs.summary = prop.initializer.text
          } else if (
            propName === 'description' &&
            ts.isStringLiteral(prop.initializer)
          ) {
            docs.description = prop.initializer.text
          } else if (
            propName === 'tags' &&
            ts.isArrayLiteralExpression(prop.initializer)
          ) {
            docs.tags = prop.initializer.elements
              .filter(ts.isStringLiteral)
              .map((element) => element.text)
          } else if (
            propName === 'errors' &&
            ts.isArrayLiteralExpression(prop.initializer)
          ) {
            docs.errors = prop.initializer.elements
              .filter(ts.isIdentifier)
              .map((element) => element.text as unknown as string)
          }
        }
      })

      return docs
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
