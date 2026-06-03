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

/**
 * Wiring identity fields (`name`, `secretId`, `variableId`, …) are read
 * STATICALLY from source — a const or variable reference is keyed by its
 * identifier text, not its runtime value, so the wiring is silently skipped at
 * runtime (`metadata not found`). If the named property exists but is not an
 * inline literal, raise a fatal diagnostic so the build fails instead.
 */
export const assertStringLiteralProperty = (
  obj: ts.ObjectLiteralExpression,
  propertyName: string,
  wiringType: string,
  logger?: { critical: (code: ErrorCode, message: string) => void }
): void => {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === propertyName
  )
  if (!property || !ts.isPropertyAssignment(property)) {
    return
  }
  const init = property.initializer
  const isStaticLiteral =
    ts.isStringLiteral(init) ||
    ts.isNoSubstitutionTemplateLiteral(init) ||
    ts.isNumericLiteral(init)
  if (isStaticLiteral) {
    return
  }
  const errorMsg = `${wiringType} has a non-literal '${propertyName}': \`${init.getText()}\`. Wiring identity fields must be inline string literals — the inspector reads them statically from source, so a const or variable reference is keyed by its identifier text and the wiring is silently skipped at runtime. Inline the literal instead, e.g. ${propertyName}: 'my-wiring-name'.`
  if (logger) {
    logger.critical(ErrorCode.NON_LITERAL_WIRE_NAME, errorMsg)
  } else {
    console.error(errorMsg)
  }
}

export const getPropertyValue = (
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): string | string[] | number | null | boolean => {
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

    if (ts.isNumericLiteral(initializer)) {
      if (propertyName === 'name' || propertyName === 'schedule') {
        return initializer.text
      }
      return Number(initializer.text)
    }

    if (
      ts.isStringLiteral(initializer) ||
      ts.isNoSubstitutionTemplateLiteral(initializer)
    ) {
      return initializer.text
    }

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
  disabled?: true
  title?: string
  tags?: string[]
  summary?: string
  description?: string
  errors?: string[]
} => {
  const metadata: {
    disabled?: true
    title?: string
    tags?: string[]
    summary?: string
    description?: string
    errors?: string[]
  } = {}

  assertStringLiteralProperty(obj, 'name', wiringType, logger)

  obj.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text

      if (
        propName === 'disabled' &&
        prop.initializer.kind === ts.SyntaxKind.TrueKeyword
      ) {
        metadata.disabled = true
      } else if (propName === 'title' && ts.isStringLiteral(prop.initializer)) {
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
