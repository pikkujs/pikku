import * as ts from 'typescript'
import {
  getPropertyValue,
  getArrayPropertyValue,
} from '../utils/get-property-value.js'
import { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'

export const addSecret: AddWiring = (
  logger,
  node,
  checker,
  state,
  _options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  if (!ts.isIdentifier(expression) || expression.text !== 'wireSecret') {
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

    let schemaVariableName: string | null = null
    let schemaSourceFile: string | null = null
    let schemaIdentifier: ts.Identifier | null = null
    for (const prop of obj.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'schema'
      ) {
        if (ts.isIdentifier(prop.initializer)) {
          schemaVariableName = prop.initializer.text
          schemaIdentifier = prop.initializer

          const symbol = checker.getSymbolAtLocation(prop.initializer)
          if (symbol) {
            const decl = symbol.valueDeclaration || symbol.declarations?.[0]
            if (decl) {
              if (ts.isImportSpecifier(decl)) {
                const aliasedSymbol = checker.getAliasedSymbol(symbol)
                if (aliasedSymbol) {
                  const aliasedDecl =
                    aliasedSymbol.valueDeclaration ||
                    aliasedSymbol.declarations?.[0]
                  if (aliasedDecl) {
                    schemaSourceFile = aliasedDecl.getSourceFile().fileName
                  }
                }
              } else {
                schemaSourceFile = decl.getSourceFile().fileName
              }
            }
          }
        }
        break
      }
    }

    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "Secret is missing the required 'name' property."
      )
      return
    }

    if (!displayNameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Secret '${nameValue}' is missing the required 'displayName' property.`
      )
      return
    }

    if (!secretIdValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Secret '${nameValue}' is missing the required 'secretId' property.`
      )
      return
    }

    if (!schemaVariableName || !schemaSourceFile || !schemaIdentifier) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Secret '${nameValue}' is missing the required 'schema' property or schema is not a variable reference.`
      )
      return
    }

    const sourceFile = node.getSourceFile().fileName

    state.secrets.files.add(sourceFile)

    const vendor = detectSchemaVendorOrError(
      schemaIdentifier,
      checker,
      logger,
      `Secret '${nameValue}'`,
      schemaSourceFile
    )
    if (!vendor) return

    const schemaLookupName = `SecretSchema_${nameValue}`
    state.schemaLookup.set(schemaLookupName, {
      variableName: schemaVariableName,
      sourceFile: schemaSourceFile,
      vendor,
    })

    state.secrets.definitions.push({
      name: nameValue,
      displayName: displayNameValue,
      description: descriptionValue || undefined,
      secretId: secretIdValue,
      schema: schemaLookupName,
      sourceFile,
    })
  }
}

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

    state.secrets.files.add(sourceFile)

    state.secrets.definitions.push({
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
