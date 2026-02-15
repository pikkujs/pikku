import * as ts from 'typescript'
import {
  getPropertyValue,
  getArrayPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { extractWireNames } from '../utils/post-process.js'
import { AddWiring, SchemaRef } from '../types.js'
import {
  extractFunctionName,
  funcIdToTypeName,
} from '../utils/extract-function-name.js'
import {
  resolveMiddleware,
  resolveChannelMiddleware,
  resolveAIMiddleware,
} from '../utils/middleware.js'
import { resolvePermissions } from '../utils/permissions.js'
import { ErrorCode } from '../error-codes.js'
import { detectSchemaVendorOrError } from '../utils/detect-schema-vendor.js'

export const addAIAgent: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuAIAgent') {
    return
  }

  if (!firstArg) {
    return
  }

  const { exportedName } = extractFunctionName(node, checker, state.rootDir)

  if (ts.isObjectLiteralExpression(firstArg)) {
    const obj = firstArg

    const nameValue = getPropertyValue(obj, 'name') as string | null
    const { disabled, tags, summary, description, errors } =
      getCommonWireMetaData(obj, 'AI agent', nameValue, logger)

    if (disabled) return

    const modelValue = getPropertyValue(obj, 'model') as string | null

    const instructionsValue = getPropertyValue(obj, 'instructions') as
      | string
      | string[]
      | null

    const maxStepsValue = getPropertyValue(obj, 'maxSteps') as number | null
    const toolChoiceValue = getPropertyValue(obj, 'toolChoice') as string | null
    const agentsValue = getArrayPropertyValue(obj, 'agents')

    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "AI agent is missing the required 'name' property."
      )
      return
    }

    if (!description) {
      logger.critical(
        ErrorCode.MISSING_DESCRIPTION,
        `AI agent '${nameValue}' is missing a description.`
      )
      return
    }

    const resolveSchemaRef = (
      identifier: ts.Identifier,
      context: string
    ): SchemaRef | null => {
      const symbol = checker.getSymbolAtLocation(identifier)
      if (!symbol) return null

      const decl = symbol.valueDeclaration || symbol.declarations?.[0]
      if (!decl) return null

      let sourceFile: string

      if (ts.isImportSpecifier(decl)) {
        const aliasedSymbol = checker.getAliasedSymbol(symbol)
        if (aliasedSymbol) {
          const aliasedDecl =
            aliasedSymbol.valueDeclaration || aliasedSymbol.declarations?.[0]
          if (aliasedDecl) {
            sourceFile = aliasedDecl.getSourceFile().fileName
          } else {
            return null
          }
        } else {
          return null
        }
      } else {
        sourceFile = decl.getSourceFile().fileName
      }

      const vendor = detectSchemaVendorOrError(
        identifier,
        checker,
        logger,
        context,
        sourceFile
      )
      if (!vendor) return null

      return {
        variableName: identifier.text,
        sourceFile,
        vendor,
      }
    }

    let inputSchema: string | null = null
    let outputSchema: string | null = null
    const capitalizedName = funcIdToTypeName(nameValue)

    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text
        if (propName === 'input' || propName === 'output') {
          if (ts.isIdentifier(prop.initializer)) {
            const context = `AI agent '${nameValue}' ${propName}`
            const ref = resolveSchemaRef(prop.initializer, context)
            if (ref) {
              const schemaName = `${capitalizedName}${propName.charAt(0).toUpperCase() + propName.slice(1)}`
              state.schemaLookup.set(schemaName, ref)
              state.functions.typesMap.addCustomType(schemaName, 'unknown', [])
              if (propName === 'input') {
                inputSchema = schemaName
              } else {
                outputSchema = schemaName
              }
            }
          } else if (ts.isCallExpression(prop.initializer)) {
            const schemaName = `${capitalizedName}${propName.charAt(0).toUpperCase() + propName.slice(1)}`
            logger.critical(
              ErrorCode.INLINE_SCHEMA,
              `Inline schemas are not supported for '${propName}' in AI agent '${nameValue}'.\n` +
                `  Extract to an exported variable:\n` +
                `    export const ${schemaName} = ${prop.initializer.getText()}\n` +
                `  Then use: ${propName}: ${schemaName}`
            )
          }
        }
      }
    }

    const middleware = resolveMiddleware(state, obj, tags, checker)
    const channelMiddleware = resolveChannelMiddleware(
      state,
      obj,
      tags,
      checker
    )
    const aiMiddleware = resolveAIMiddleware(state, obj, checker)
    const permissions = resolvePermissions(state, obj, tags, checker)

    state.serviceAggregation.usedFunctions.add(nameValue)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )
    extractWireNames(permissions).forEach((name) =>
      state.serviceAggregation.usedPermissions.add(name)
    )

    if (exportedName) {
      state.agents.files.set(nameValue, {
        path: node.getSourceFile().fileName,
        exportedName,
      })
    }

    state.agents.agentsMeta[nameValue] = {
      name: nameValue,
      description,
      instructions: instructionsValue || '',
      model: modelValue || '',
      summary,
      errors,
      ...(maxStepsValue !== null && { maxSteps: maxStepsValue }),
      ...(toolChoiceValue !== null && {
        toolChoice: toolChoiceValue as 'auto' | 'required' | 'none',
      }),
      ...(agentsValue !== null && { agents: agentsValue }),
      tags,
      inputSchema,
      outputSchema,
      middleware,
      channelMiddleware,
      aiMiddleware,
      permissions,
    }
  }
}
