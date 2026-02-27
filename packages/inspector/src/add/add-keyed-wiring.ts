import * as ts from 'typescript'
import { getPropertyValue } from '../utils/get-property-value.js'
import type { AddWiring, InspectorState } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'

export interface KeyedWiringConfig {
  functionName: string
  idField: string
  label: string
  schemaPrefix: string
  getState: (state: InspectorState) => {
    definitions: any[]
    files: Set<string>
  }
}

export const createAddKeyedWiring = (config: KeyedWiringConfig): AddWiring => {
  return (logger, node, checker, state, _options) => {
    if (!ts.isCallExpression(node)) {
      return
    }

    const args = node.arguments
    const firstArg = args[0]
    const expression = node.expression

    if (
      !ts.isIdentifier(expression) ||
      expression.text !== config.functionName
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
      const idValue = getPropertyValue(obj, config.idField) as string | null

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
          `${config.label} is missing the required 'name' property.`
        )
        return
      }

      if (!displayNameValue) {
        logger.critical(
          ErrorCode.MISSING_NAME,
          `${config.label} '${nameValue}' is missing the required 'displayName' property.`
        )
        return
      }

      if (!idValue) {
        logger.critical(
          ErrorCode.MISSING_NAME,
          `${config.label} '${nameValue}' is missing the required '${config.idField}' property.`
        )
        return
      }

      if (!schemaVariableName || !schemaSourceFile || !schemaIdentifier) {
        logger.critical(
          ErrorCode.MISSING_NAME,
          `${config.label} '${nameValue}' is missing the required 'schema' property or schema is not a variable reference.`
        )
        return
      }

      const sourceFile = node.getSourceFile().fileName

      const wiringState = config.getState(state)
      wiringState.files.add(sourceFile)

      const vendor = detectSchemaVendorOrError(
        schemaIdentifier,
        checker,
        logger,
        `${config.label} '${nameValue}'`,
        schemaSourceFile
      )
      if (!vendor) return

      const schemaLookupName = `${config.schemaPrefix}_${nameValue}`
      state.schemaLookup.set(schemaLookupName, {
        variableName: schemaVariableName,
        sourceFile: schemaSourceFile,
        vendor,
      })

      wiringState.definitions.push({
        name: nameValue,
        displayName: displayNameValue,
        description: descriptionValue || undefined,
        [config.idField]: idValue,
        schema: schemaLookupName,
        sourceFile,
      })
    }
  }
}
