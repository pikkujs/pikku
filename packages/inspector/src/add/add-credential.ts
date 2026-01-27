import * as ts from 'typescript'
import {
  getPropertyValue,
  getArrayPropertyValue,
} from '../utils/get-property-value.js'
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

    // Store definition - CLI validates duplicates and builds meta
    state.credentials.definitions.push({
      name: nameValue,
      displayName: displayNameValue,
      description: descriptionValue || undefined,
      secretId: secretIdValue,
      schema: schemaLookupName,
      sourceFile,
    })
  }
}

/**
 * Inspector for wireOAuth2Credential calls.
 * Extracts metadata for OAuth2 credential declarations.
 * Note: wireOAuth2Credential is metadata-only - no runtime behavior.
 */
export const addOAuth2Credential: AddWiring = (
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

  // Check if the call is to wireOAuth2Credential
  if (
    !ts.isIdentifier(expression) ||
    expression.text !== 'wireOAuth2Credential'
  ) {
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
    const tokenSecretIdValue = getPropertyValue(obj, 'tokenSecretId') as
      | string
      | null
    const authorizationUrlValue = getPropertyValue(obj, 'authorizationUrl') as
      | string
      | null
    const tokenUrlValue = getPropertyValue(obj, 'tokenUrl') as string | null
    const scopesValue = getArrayPropertyValue(obj, 'scopes')
    const pkceValue = getPropertyValue(obj, 'pkce') as boolean | null

    // Validate required fields
    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "OAuth2 Credential is missing the required 'name' property."
      )
      return
    }

    if (!displayNameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `OAuth2 Credential '${nameValue}' is missing the required 'displayName' property.`
      )
      return
    }

    if (!secretIdValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `OAuth2 Credential '${nameValue}' is missing the required 'secretId' property.`
      )
      return
    }

    if (!tokenSecretIdValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `OAuth2 Credential '${nameValue}' is missing the required 'tokenSecretId' property.`
      )
      return
    }

    if (!authorizationUrlValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `OAuth2 Credential '${nameValue}' is missing the required 'authorizationUrl' property.`
      )
      return
    }

    if (!tokenUrlValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `OAuth2 Credential '${nameValue}' is missing the required 'tokenUrl' property.`
      )
      return
    }

    if (!scopesValue || scopesValue.length === 0) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `OAuth2 Credential '${nameValue}' is missing the required 'scopes' property.`
      )
      return
    }

    const sourceFile = node.getSourceFile().fileName

    state.credentials.files.add(sourceFile)

    // Store OAuth2 credential definition - CLI validates duplicates and builds meta
    state.credentials.definitions.push({
      name: nameValue,
      displayName: displayNameValue,
      description: descriptionValue || undefined,
      secretId: secretIdValue,
      oauth2: {
        tokenSecretId: tokenSecretIdValue,
        authorizationUrl: authorizationUrlValue,
        tokenUrl: tokenUrlValue,
        scopes: scopesValue,
        pkce: pkceValue || undefined,
      },
      sourceFile,
    })
  }
}
