import * as ts from 'typescript'
import {
  getPropertyValue,
  getArrayPropertyValue,
  getObjectPropertyLiteral,
  assertStringLiteralProperty,
} from '../utils/get-property-value.js'
import type { AddWiring, InspectorState } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'
import { parseDurationString } from '@pikku/core/utils'
import { SECRET_GENERATE_TYPES } from '@pikku/core/secret'
import type { SecretGenerate, SecretGenerateType } from '@pikku/core/secret'

export interface KeyedWiringConfig {
  functionName: string
  idField: string
  label: string
  schemaPrefix: string
  /** Boolean property carrying this wiring kind's deploy-gate opt-in/opt-out. */
  flagField: string
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

      assertStringLiteralProperty(obj, 'name', config.label, logger)
      assertStringLiteralProperty(obj, config.idField, config.label, logger)

      const nameValue = getPropertyValue(obj, 'name') as string | null
      const displayNameValue = getPropertyValue(obj, 'displayName') as
        string | null
      const descriptionValue = getPropertyValue(obj, 'description') as
        string | null
      const rotationPeriodValue = getPropertyValue(obj, 'rotationPeriod') as
        string | null
      const docsUrlValue = getPropertyValue(obj, 'docsUrl') as string | null
      const allowedHostsValue = getArrayPropertyValue(obj, 'allowedHosts')
      const idValue = getPropertyValue(obj, config.idField) as string | null
      const flagValue = getPropertyValue(obj, config.flagField) === true

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

      if (rotationPeriodValue && rotationPeriodValue !== 'never') {
        try {
          parseDurationString(rotationPeriodValue)
        } catch {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `${config.label} '${nameValue}' has an invalid 'rotationPeriod': '${rotationPeriodValue}'. Use a duration like '1d', '30day', or '1w'.`
          )
          return
        }
      }

      let generateValue: SecretGenerate | undefined
      const generateObj =
        config.idField === 'secretId'
          ? getObjectPropertyLiteral(obj, 'generate')
          : null
      if (generateObj) {
        const typeValue = getPropertyValue(generateObj, 'type')
        const sizeValue = getPropertyValue(generateObj, 'size')
        if (
          typeof typeValue !== 'string' ||
          !(SECRET_GENERATE_TYPES as readonly string[]).includes(typeValue)
        ) {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `${config.label} '${nameValue}' has an invalid 'generate' type. Use one of: ${SECRET_GENERATE_TYPES.join(', ')}.`
          )
          return
        }
        if (
          sizeValue !== null &&
          (typeof sizeValue !== 'number' ||
            !Number.isInteger(sizeValue) ||
            sizeValue < 1)
        ) {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `${config.label} '${nameValue}' has an invalid 'generate' size. Use a positive whole number.`
          )
          return
        }
        if (!rotationPeriodValue) {
          logger.critical(
            ErrorCode.INVALID_VALUE,
            `${config.label} '${nameValue}' is generated, so it needs a 'rotationPeriod' such as '30day', or 'never' to generate it once.`
          )
          return
        }
        generateValue = {
          type: typeValue as SecretGenerateType,
          ...(typeof sizeValue === 'number' ? { size: sizeValue } : {}),
        }
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
        rotationPeriod: rotationPeriodValue || undefined,
        generate: generateValue,
        docsUrl: docsUrlValue || undefined,
        allowedHosts: allowedHostsValue || undefined,
        [config.idField]: idValue,
        [config.flagField]: flagValue || undefined,
        schema: schemaLookupName,
        sourceFile,
      })
    }
  }
}
