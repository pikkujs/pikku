import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

/**
 * Inspector for wireCredential calls.
 * Extracts metadata for credential declarations.
 * Note: wireCredential is metadata-only - no runtime behavior.
 * Schema is stored as the variable name reference; actual Zod→JSON Schema conversion happens at CLI build time.
 */
export const addCredential: AddWiring = (
  logger,
  node,
  _checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  // Check if the call is to wireCredential
  if (!ts.isIdentifier(expression) || expression.text !== 'wireCredential') {
    return
  }

  if (!firstArg) {
    return
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const displayNameValue = getPropertyValue(obj, 'displayName') as
      | string
      | null
    const descriptionValue = getPropertyValue(obj, 'description') as
      | string
      | null
    const secretIdValue = getPropertyValue(obj, 'secretId') as string | null

    // Get schema variable name for later runtime import
    let schemaVariableName: string | null = null
    for (const prop of obj.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'schema'
      ) {
        if (ts.isIdentifier(prop.initializer)) {
          schemaVariableName = prop.initializer.text
        }
        break
      }
    }

    // Validate required fields
    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "Credential is missing the required 'name' property."
      )
      return
    }

    if (!displayNameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Credential '${nameValue}' is missing the required 'displayName' property.`
      )
      return
    }

    if (!secretIdValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Credential '${nameValue}' is missing the required 'secretId' property.`
      )
      return
    }

    if (!schemaVariableName) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Credential '${nameValue}' is missing the required 'schema' property or schema is not a variable reference.`
      )
      return
    }

    const sourceFile = node.getSourceFile().fileName

    state.credentials.files.add(sourceFile)

    // Register the zod schema in the central zodLookup for deferred conversion
    const schemaLookupName = `Credential_${nameValue}`
    state.zodLookup.set(schemaLookupName, {
      variableName: schemaVariableName,
      sourceFile,
    })

    // Store metadata - schema conversion happens later in schema-generator
    state.credentials.meta[nameValue] = {
      name: nameValue,
      displayName: displayNameValue,
      description: descriptionValue || undefined,
      secretId: secretIdValue,
      schema: schemaLookupName,
    }
  }
}
