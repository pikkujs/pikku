import * as ts from 'typescript'
import { ErrorCode } from '../error-codes.js'

/**
 * Extracts an array of strings from an object property.
 */
export const getArrayPropertyValue = (
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): string[] | null => {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === propertyName
  )

  if (property && ts.isPropertyAssignment(property)) {
    const initializer = property.initializer
    if (ts.isArrayLiteralExpression(initializer)) {
      return initializer.elements
        .filter(ts.isStringLiteral)
        .map((element) => element.text)
    }
  }

  return null
}

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
 * Extracts common wire metadata (title, tags, summary, description, errors) directly from an object
 * @param obj - The TypeScript object literal expression to extract metadata from
 * @param wiringType - The type of wiring (e.g., 'HTTP route', 'Channel', 'Queue worker')
 * @param wiringName - The name/identifier of the wiring (e.g., route path, channel name)
 * @param logger - Optional logger instance; if not provided, uses console.error
 * @returns Object containing the common wire metadata fields
 */
export const getCommonWireMetaData = (
  obj: ts.ObjectLiteralExpression,
  wiringType: string,
  wiringName: string | null,
  logger?: { critical: (code: ErrorCode, message: string) => void }
): {
  title?: string
  tags?: string[]
  summary?: string
  description?: string
  errors?: string[]
} => {
  const metadata: {
    title?: string
    tags?: string[]
    summary?: string
    description?: string
    errors?: string[]
  } = {}

  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text

      if (propName === 'title' && ts.isStringLiteral(prop.initializer)) {
        metadata.title = prop.initializer.text
      } else if (
        propName === 'summary' &&
        ts.isStringLiteral(prop.initializer)
      ) {
        metadata.summary = prop.initializer.text
      } else if (
        propName === 'description' &&
        ts.isStringLiteral(prop.initializer)
      ) {
        metadata.description = prop.initializer.text
      } else if (propName === 'tags') {
        if (ts.isArrayLiteralExpression(prop.initializer)) {
          metadata.tags = prop.initializer.elements
            .filter(ts.isStringLiteral)
            .map((element) => element.text)
        } else {
          const errorMsg = `${wiringType} '${wiringName}' has invalid 'tags' property - must be an array of strings.`
          if (logger) {
            logger.critical(ErrorCode.INVALID_TAGS_TYPE, errorMsg)
          } else {
            console.error(errorMsg)
          }
        }
      } else if (propName === 'errors') {
        if (ts.isArrayLiteralExpression(prop.initializer)) {
          metadata.errors = prop.initializer.elements
            .filter(ts.isIdentifier)
            .map((element) => element.text as unknown as string)
        } else {
          const errorMsg = `${wiringType} '${wiringName}' has invalid 'errors' property - must be an array of error identifiers.`
          if (logger) {
            logger.critical(ErrorCode.INVALID_TAGS_TYPE, errorMsg)
          } else {
            console.error(errorMsg)
          }
        }
      }
    }
  })

  return metadata
}
