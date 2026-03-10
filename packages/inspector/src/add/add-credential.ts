import * as ts from 'typescript'
import {
  getPropertyValue,
  getArrayPropertyValue,
} from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'

export const addCredential: AddWiring = (
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
    const typeValue = getPropertyValue(obj, 'type') as string | null

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

    if (!typeValue || (typeValue !== 'singleton' && typeValue !== 'wire')) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        `Credential '${nameValue}' is missing or has invalid 'type' property. Must be 'singleton' or 'wire'.`
      )
      return
    }

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

    let oauth2: any = undefined
    const oauth2Prop = obj.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'oauth2'
    )
    if (
      oauth2Prop &&
      ts.isPropertyAssignment(oauth2Prop) &&
      ts.isObjectLiteralExpression(oauth2Prop.initializer)
    ) {
      const oauth2Obj = oauth2Prop.initializer
      const appCredentialSecretId = getPropertyValue(
        oauth2Obj,
        'appCredentialSecretId'
      ) as string | null
      const tokenSecretId = getPropertyValue(oauth2Obj, 'tokenSecretId') as
        | string
        | null
      const authorizationUrl = getPropertyValue(
        oauth2Obj,
        'authorizationUrl'
      ) as string | null
      const tokenUrl = getPropertyValue(oauth2Obj, 'tokenUrl') as string | null
      const scopes = getArrayPropertyValue(oauth2Obj, 'scopes')
      const pkce = getPropertyValue(oauth2Obj, 'pkce') as boolean | null

      if (appCredentialSecretId && authorizationUrl && tokenUrl && scopes) {
        oauth2 = {
          appCredentialSecretId,
          tokenSecretId: tokenSecretId || undefined,
          authorizationUrl,
          tokenUrl,
          scopes,
          pkce: pkce || undefined,
        }
      }
    }

    const sourceFile = node.getSourceFile().fileName
    state.credentials.files.add(sourceFile)

    let schemaLookupName: string | undefined
    if (schemaVariableName && schemaSourceFile && schemaIdentifier) {
      const vendor = detectSchemaVendorOrError(
        schemaIdentifier,
        checker,
        logger,
        `Credential '${nameValue}'`,
        schemaSourceFile
      )
      if (vendor) {
        schemaLookupName = `CredentialSchema_${nameValue}`
        state.schemaLookup.set(schemaLookupName, {
          variableName: schemaVariableName,
          sourceFile: schemaSourceFile,
          vendor,
        })
      }
    }

    state.credentials.definitions.push({
      name: nameValue,
      displayName: displayNameValue,
      description: descriptionValue || undefined,
      type: typeValue as 'singleton' | 'wire',
      schema: schemaLookupName,
      oauth2,
      sourceFile,
    })
  }
}
