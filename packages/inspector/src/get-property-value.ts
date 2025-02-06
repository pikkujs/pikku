import { APIDocs } from '@pikku/core'
import * as ts from 'typescript'

export const getPropertyValue = (
  obj: ts.ObjectLiteralExpression,
  propertyName: string
): string | string[] | null | APIDocs => {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === propertyName
  )

  if (property && ts.isPropertyAssignment(property)) {
    const initializer = property.initializer

    // Special handling for 'query' -> expect an array of strings
    if (propertyName === 'query' && ts.isArrayLiteralExpression(initializer)) {
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
      const docs: APIDocs = {}

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

    // Handle string literals for other properties
    if (
      ts.isStringLiteral(initializer) ||
      ts.isNoSubstitutionTemplateLiteral(initializer)
    ) {
      return initializer.text
    } else {
      // Handle other initializer types if necessary
      return initializer.getText()
    }
  }

  return null
}
