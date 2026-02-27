import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import { extractWireNames } from '../utils/post-process.js'
import type { AddWiring, InspectorLogger, SchemaRef } from '../types.js'
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

function resolveToolReferences(
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  agentName: string,
  logger: InspectorLogger
): string[] | null {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'tools'
  )

  if (!property || !ts.isPropertyAssignment(property)) {
    return null
  }

  const initializer = property.initializer
  if (!ts.isArrayLiteralExpression(initializer)) {
    return null
  }

  const resolved: string[] = []

  for (const element of initializer.elements) {
    if (ts.isStringLiteral(element)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `AI agent '${agentName}' tools array contains a string literal '${element.text}'. ` +
          `Use a function reference instead (e.g., import the pikkuFunc variable).`
      )
      continue
    }

    if (ts.isCallExpression(element) && ts.isIdentifier(element.expression)) {
      const calleeName = element.expression.text

      if (calleeName === 'workflow') {
        const [firstArg] = element.arguments
        if (firstArg && ts.isStringLiteral(firstArg)) {
          resolved.push(`workflow:${firstArg.text}`)
          continue
        }
      }

      if (calleeName === 'addon') {
        const [firstArg] = element.arguments
        if (firstArg && ts.isStringLiteral(firstArg)) {
          resolved.push(firstArg.text)
          continue
        }
      }
    }

    if (ts.isIdentifier(element)) {
      const rpcName = resolveIdentifierToRpcName(element, checker)
      if (rpcName) {
        resolved.push(rpcName)
        continue
      }

      logger.critical(
        ErrorCode.INVALID_VALUE,
        `AI agent '${agentName}' tools array contains identifier '${element.text}' ` +
          `that could not be resolved to a pikkuFunc.`
      )
    }
  }

  return resolved.length > 0 ? resolved : null
}

function resolveAgentReferences(
  obj: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  agentName: string,
  logger: InspectorLogger
): string[] | null {
  const property = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'agents'
  )

  if (!property || !ts.isPropertyAssignment(property)) {
    return null
  }

  const initializer = property.initializer
  if (!ts.isArrayLiteralExpression(initializer)) {
    return null
  }

  const resolved: string[] = []

  for (const element of initializer.elements) {
    if (ts.isStringLiteral(element)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `AI agent '${agentName}' agents array contains a string literal '${element.text}'. ` +
          `Use an agent reference instead (e.g., import the pikkuAIAgent variable).`
      )
      continue
    }

    if (ts.isIdentifier(element)) {
      const name = resolveIdentifierToAgentName(element, checker)
      if (name) {
        resolved.push(name)
        continue
      }

      logger.critical(
        ErrorCode.INVALID_VALUE,
        `AI agent '${agentName}' agents array contains identifier '${element.text}' ` +
          `that could not be resolved to a pikkuAIAgent.`
      )
    }
  }

  return resolved.length > 0 ? resolved : null
}

function resolveIdentifierToRpcName(
  identifier: ts.Identifier,
  checker: ts.TypeChecker
): string | null {
  const symbol = checker.getSymbolAtLocation(identifier)
  if (!symbol) return null

  let resolved = symbol
  if (resolved.flags & ts.SymbolFlags.Alias) {
    resolved = checker.getAliasedSymbol(resolved) ?? resolved
  }

  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0]
  if (!decl) return null

  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    if (
      ts.isCallExpression(decl.initializer) &&
      ts.isIdentifier(decl.initializer.expression)
    ) {
      const callName = decl.initializer.expression.text
      if (
        callName === 'pikkuFunc' ||
        callName === 'pikkuSessionlessFunc' ||
        callName === 'pikkuVoidFunc'
      ) {
        const firstArg = decl.initializer.arguments[0]
        if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
          for (const prop of firstArg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === 'override' &&
              ts.isStringLiteral(prop.initializer)
            ) {
              return prop.initializer.text
            }
          }
        }

        if (ts.isIdentifier(decl.name)) {
          return decl.name.text
        }
      }
    }
  }

  return null
}

function resolveIdentifierToAgentName(
  identifier: ts.Identifier,
  checker: ts.TypeChecker
): string | null {
  const symbol = checker.getSymbolAtLocation(identifier)
  if (!symbol) return null

  let resolved = symbol
  if (resolved.flags & ts.SymbolFlags.Alias) {
    resolved = checker.getAliasedSymbol(resolved) ?? resolved
  }

  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0]
  if (!decl) return null

  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    if (
      ts.isCallExpression(decl.initializer) &&
      ts.isIdentifier(decl.initializer.expression) &&
      decl.initializer.expression.text === 'pikkuAIAgent'
    ) {
      if (ts.isIdentifier(decl.name)) {
        return decl.name.text
      }
    }
  }

  return null
}

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
    const temperatureValue = getPropertyValue(obj, 'temperature') as
      | number
      | null
    const toolChoiceValue = getPropertyValue(obj, 'toolChoice') as string | null
    const toolsValue = resolveToolReferences(
      obj,
      checker,
      nameValue || '',
      logger
    )

    if (toolsValue) {
      for (const toolName of toolsValue) {
        if (toolName.startsWith('workflow:') || toolName.includes(':')) continue
        const funcFile = state.functions.files.get(toolName)
        if (funcFile && !state.rpc.internalFiles.has(toolName)) {
          state.rpc.internalFiles.set(toolName, funcFile)
        }
      }
    }

    const agentsValue = resolveAgentReferences(
      obj,
      checker,
      nameValue || '',
      logger
    )

    if (!nameValue) {
      logger.critical(
        ErrorCode.MISSING_NAME,
        "AI agent is missing the required 'name' property."
      )
      return
    }

    const agentKey = exportedName || nameValue

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
    let workingMemorySchema: string | null = null
    const capitalizedName = funcIdToTypeName(agentKey)

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
        } else if (
          propName === 'memory' &&
          ts.isObjectLiteralExpression(prop.initializer)
        ) {
          for (const memProp of prop.initializer.properties) {
            if (
              ts.isPropertyAssignment(memProp) &&
              ts.isIdentifier(memProp.name) &&
              memProp.name.text === 'workingMemory' &&
              ts.isIdentifier(memProp.initializer)
            ) {
              const context = `AI agent '${nameValue}' workingMemory`
              const ref = resolveSchemaRef(memProp.initializer, context)
              if (ref) {
                const schemaName = `${capitalizedName}WorkingMemory`
                state.schemaLookup.set(schemaName, ref)
                state.functions.typesMap.addCustomType(
                  schemaName,
                  'unknown',
                  []
                )
                workingMemorySchema = schemaName
              }
            }
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

    state.serviceAggregation.usedFunctions.add(agentKey)
    extractWireNames(middleware).forEach((name) =>
      state.serviceAggregation.usedMiddleware.add(name)
    )
    extractWireNames(permissions).forEach((name) =>
      state.serviceAggregation.usedPermissions.add(name)
    )

    if (exportedName) {
      state.agents.files.set(agentKey, {
        path: node.getSourceFile().fileName,
        exportedName,
      })
    }

    state.agents.agentsMeta[agentKey] = {
      name: nameValue,
      description,
      instructions: instructionsValue || '',
      model: modelValue || '',
      summary,
      errors,
      ...(maxStepsValue !== null && { maxSteps: maxStepsValue }),
      ...(temperatureValue !== null && { temperature: temperatureValue }),
      ...(toolChoiceValue !== null && {
        toolChoice: toolChoiceValue as 'auto' | 'required' | 'none',
      }),
      ...(toolsValue !== null && { tools: toolsValue }),
      ...(agentsValue !== null && { agents: agentsValue }),
      tags,
      inputSchema,
      outputSchema,
      workingMemorySchema,
      middleware,
      channelMiddleware,
      aiMiddleware,
      permissions,
    }
  }
}
