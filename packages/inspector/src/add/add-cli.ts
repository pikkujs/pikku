import ts, { TypeChecker } from 'typescript'
import {
  AddWiring,
  InspectorLogger,
  InspectorOptions,
  InspectorState,
} from '../types.js'
import { CLIProgramMeta, CLICommandMeta } from '@pikku/core/cli'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'
import { getPropertyValue } from '../utils/get-property-value.js'
import { resolveIdentifier } from '../utils/resolve-identifier.js'

// Track if we've warned about missing Config type to avoid duplicate warnings
const configTypeWarningShown = new Set<string>()

/**
 * Adds CLI command metadata to the inspector state
 */
export const addCLI: AddWiring = (
  logger,
  node,
  typeChecker,
  inspectorState,
  options
) => {
  if (!ts.isCallExpression(node)) return
  // Check if this is a wireCLI call
  if (!node || !node.expression) {
    return
  }
  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'wireCLI') {
    return
  }

  // Get the argument (should be an object literal)
  if (node.arguments.length !== 1) {
    return
  }

  const arg = node.arguments[0]
  if (!ts.isObjectLiteralExpression(arg)) {
    return
  }

  const sourceFile = node.getSourceFile()

  // Add to files set
  inspectorState.cli.files.add(sourceFile.fileName)

  // Process the CLI configuration
  const cliConfig = processCLIConfig(
    logger,
    arg,
    sourceFile,
    typeChecker,
    inspectorState,
    options
  )

  if (!cliConfig) {
    return
  }

  // Add this program to the CLI metadata
  inspectorState.cli.meta.programs[cliConfig.programName] =
    cliConfig.programMeta
}

/**
 * Processes a CLI configuration object
 */
function processCLIConfig(
  logger: InspectorLogger,
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker,
  inspectorState: InspectorState,
  options: InspectorOptions
): { programName: string; programMeta: CLIProgramMeta } | null {
  let programName = ''
  let programTags: string[] | undefined
  const programMeta: CLIProgramMeta = {
    program: '',
    commands: {},
    options: {},
  }

  // First pass: extract program name and tags
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'program' && ts.isStringLiteral(prop.initializer)) {
      programName = prop.initializer.text
      programMeta.program = programName
    } else if (propName === 'tags') {
      programTags = (getPropertyValue(node, 'tags') as string[]) || undefined
    }
  }

  if (!programName) {
    return null
  }

  if (getPropertyValue(node, 'disabled') === true) {
    return null
  }

  // Second pass: process other properties with program tags available
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    switch (propName) {
      case 'program':
      case 'tags':
        // Already handled in first pass
        break

      case 'commands':
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          programMeta.commands = processCommands(
            logger,
            prop.initializer,
            sourceFile,
            typeChecker,
            programName,
            inspectorState,
            options,
            programTags
          )
        }
        break

      case 'options':
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          programMeta.options = processOptions(
            logger,
            prop.initializer,
            typeChecker,
            inspectorState,
            options
          )
        }
        break

      case 'render':
        // Extract the actual renderer function name
        programMeta.defaultRenderName = extractFunctionName(
          prop.initializer,
          typeChecker,
          inspectorState.rootDir
        ).pikkuFuncId
        break
    }
  }

  return { programName, programMeta }
}

/**
 * Processes the commands object
 */
function processCommands(
  logger: InspectorLogger,
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker,
  programName: string,
  inspectorState: InspectorState,
  options: InspectorOptions,
  programTags?: string[]
): Record<string, CLICommandMeta> {
  const commands: Record<string, CLICommandMeta> = {}
  let defaultCommandName: string | null = null

  for (const prop of node.properties) {
    // Handle spread assignments: { ...externalCommands }
    if (ts.isSpreadAssignment(prop)) {
      let spreadTarget: ts.Node | undefined = prop.expression
      if (ts.isIdentifier(prop.expression)) {
        spreadTarget = resolveIdentifier(prop.expression, typeChecker, [
          'defineCLICommands',
        ])
      }
      if (spreadTarget && ts.isObjectLiteralExpression(spreadTarget)) {
        const spreadCommands = processCommands(
          logger,
          spreadTarget,
          sourceFile,
          typeChecker,
          programName,
          inspectorState,
          options,
          programTags
        )
        Object.assign(commands, spreadCommands)
      }
      continue
    }

    if (!ts.isPropertyAssignment(prop)) continue

    const commandName = getPropertyName(prop)
    if (!commandName) continue

    const commandMeta = processCommand(
      logger,
      inspectorState,
      options,
      commandName,
      prop.initializer,
      sourceFile,
      typeChecker,
      programName,
      [],
      programTags
    )

    if (commandMeta) {
      commands[commandName] = commandMeta

      // Validate only one default command
      if (commandMeta.isDefault) {
        if (defaultCommandName !== null) {
          const position = prop.getStart(sourceFile)
          const { line, character } =
            sourceFile.getLineAndCharacterOfPosition(position)

          throw new Error(
            `Multiple default commands found in CLI program "${programName}" at ${sourceFile.fileName}:${line + 1}:${character + 1}.\n` +
              `Commands "${defaultCommandName}" and "${commandName}" are both marked as default.\n` +
              `Only one command can be marked as default per program.`
          )
        }
        defaultCommandName = commandName
      }
    }
  }

  return commands
}

/**
 * Processes a single command
 */
function processCommand(
  logger: InspectorLogger,
  inspectorState: InspectorState,
  options: InspectorOptions,
  name: string,
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker,
  programName: string,
  parentPath: string[] = [],
  programTags?: string[]
): CLICommandMeta | null {
  const fullPath = [...parentPath, name]

  // Handle shorthand (just a function)
  if (
    ts.isIdentifier(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    return {
      pikkuFuncId: extractFunctionName(
        node,
        typeChecker,
        inspectorState.rootDir
      ).pikkuFuncId,
      positionals: [],
      options: {},
    }
  }

  // Handle pikkuCLICommand calls
  if (ts.isCallExpression(node)) {
    // Check if it's a pikkuCLICommand call
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'pikkuCLICommand' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      // Process the object literal argument
      return processCommand(
        logger,
        inspectorState,
        options,
        name,
        node.arguments[0],
        sourceFile,
        typeChecker,
        programName,
        parentPath,
        programTags
      )
    }
    return null
  }

  // Handle full command object
  if (!ts.isObjectLiteralExpression(node)) {
    return null
  }

  const meta: CLICommandMeta = {
    pikkuFuncId: '',
    positionals: [],
    options: {},
  }

  // First pass: extract pikkuFuncId and tags so we can use them when processing options/middleware
  let pikkuFuncId: string | undefined
  let optionsNode: ts.ObjectLiteralExpression | undefined
  let tags: string[] | undefined

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'func') {
      pikkuFuncId = extractFunctionName(
        prop.initializer,
        typeChecker,
        inspectorState.rootDir
      ).pikkuFuncId
      meta.pikkuFuncId = pikkuFuncId
    } else if (
      propName === 'options' &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      optionsNode = prop.initializer
    } else if (propName === 'tags') {
      tags = (getPropertyValue(node, 'tags') as string[]) || undefined
    }
  }

  // Merge program-level tags with command-level tags
  const allTags = [...(programTags || []), ...(tags || [])]

  // Resolve middleware
  const middleware = resolveMiddleware(
    inspectorState,
    node,
    allTags.length > 0 ? allTags : undefined,
    typeChecker
  )
  if (middleware) {
    meta.middleware = middleware
  }

  // Add merged tags to metadata
  if (allTags.length > 0) {
    meta.tags = allTags
  }

  // Second pass: process all properties
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    switch (propName) {
      case 'parameters':
        if (ts.isStringLiteral(prop.initializer)) {
          meta.parameters = prop.initializer.text
          meta.positionals = parseCommandPattern(prop.initializer.text)
        }
        break

      case 'description':
        if (ts.isStringLiteral(prop.initializer)) {
          meta.description = prop.initializer.text
        }
        break

      case 'func':
        // Already handled in first pass
        break

      case 'render':
        meta.renderName = extractFunctionName(
          prop.initializer,
          typeChecker,
          inspectorState.rootDir
        ).pikkuFuncId
        break

      case 'options':
        // Process with pikkuFuncId from first pass
        if (optionsNode) {
          meta.options = processOptions(
            logger,
            optionsNode,
            typeChecker,
            inspectorState,
            options,
            pikkuFuncId
          )
        }
        break

      case 'subcommands':
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          meta.subcommands = {}
          for (const subProp of prop.initializer.properties) {
            if (!ts.isPropertyAssignment(subProp)) continue

            const subName = getPropertyName(subProp)
            if (!subName) continue

            const subCommand = processCommand(
              logger,
              inspectorState,
              options,
              subName,
              subProp.initializer,
              sourceFile,
              typeChecker,
              programName,
              fullPath,
              programTags
            )

            if (subCommand) {
              meta.subcommands[subName] = subCommand
            }
          }
        }
        break

      case 'isDefault':
        if (
          prop.initializer.kind === ts.SyntaxKind.TrueKeyword ||
          prop.initializer.kind === ts.SyntaxKind.FalseKeyword
        ) {
          meta.isDefault = prop.initializer.kind === ts.SyntaxKind.TrueKeyword
        }
        break
    }
  }

  // --- track used functions/middleware for service aggregation ---
  inspectorState.serviceAggregation.usedFunctions.add(meta.pikkuFuncId)
  extractWireNames(meta.middleware).forEach((name) =>
    inspectorState.serviceAggregation.usedMiddleware.add(name)
  )
  // Note: subcommands are tracked recursively when they're processed

  return meta
}

/**
 * Processes CLI options and extracts enum values from function input types
 */
function processOptions(
  logger: InspectorLogger,
  node: ts.ObjectLiteralExpression,
  typeChecker: TypeChecker,
  inspectorState: InspectorState,
  inspectorOptions: InspectorOptions,
  pikkuFuncId?: string
): Record<string, any> {
  const options: Record<string, any> = {}

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const optionName = getPropertyName(prop)
    if (!optionName) continue

    if (ts.isObjectLiteralExpression(prop.initializer)) {
      const option: any = {}
      let manualChoices: string[] | undefined

      for (const optProp of prop.initializer.properties) {
        if (!ts.isPropertyAssignment(optProp)) continue
        if (!ts.isIdentifier(optProp.name)) continue

        const optPropName = optProp.name.text

        switch (optPropName) {
          case 'description':
            if (ts.isStringLiteral(optProp.initializer)) {
              option.description = optProp.initializer.text
            }
            break

          case 'short':
            if (ts.isStringLiteral(optProp.initializer)) {
              option.short = optProp.initializer.text
            }
            break

          case 'default':
            // Extract default value from expression
            if (ts.isStringLiteral(optProp.initializer)) {
              option.default = optProp.initializer.text
            } else if (ts.isNumericLiteral(optProp.initializer)) {
              option.default = parseFloat(optProp.initializer.text)
            } else if (optProp.initializer.kind === ts.SyntaxKind.TrueKeyword) {
              option.default = true
            } else if (
              optProp.initializer.kind === ts.SyntaxKind.FalseKeyword
            ) {
              option.default = false
            }
            break

          case 'choices':
            // Extract manually specified choices
            if (ts.isArrayLiteralExpression(optProp.initializer)) {
              manualChoices = []
              for (const element of optProp.initializer.elements) {
                if (ts.isStringLiteral(element)) {
                  manualChoices.push(element.text)
                }
              }
            }
            break
        }
      }

      // Extract enum values from the function input type if available
      // Get the input type if we have a pikkuFuncId
      let inputTypes: ts.Type[] | undefined
      if (pikkuFuncId) {
        inputTypes = inspectorState.typesLookup.get(pikkuFuncId)
      }

      let derivedChoices: string[] | null = null

      if (inputTypes && inputTypes.length > 0) {
        derivedChoices = extractEnumFromPropertyType(
          inputTypes[0]!,
          optionName,
          typeChecker
        )
      } else {
        // Fallback: try to extract from Config type
        derivedChoices = extractEnumFromConfigType(
          logger,
          optionName,
          typeChecker,
          inspectorState,
          inspectorOptions
        )
      }

      // Validate and set choices
      if (manualChoices && derivedChoices) {
        // Both manual and derived choices exist - validate manual is subset of derived
        const invalidChoices = manualChoices.filter(
          (choice) => !derivedChoices!.includes(choice)
        )

        if (invalidChoices.length > 0) {
          const sourceFile = node.getSourceFile()
          const position = prop.getStart(sourceFile)
          const { line, character } =
            sourceFile.getLineAndCharacterOfPosition(position)

          throw new Error(
            `Invalid choices for option "${optionName}" at ${sourceFile.fileName}:${line + 1}:${character + 1}.\n` +
              `The following choices are not valid according to the type: ${invalidChoices.join(', ')}.\n` +
              `Valid choices from type: ${derivedChoices.join(', ')}.`
          )
        }

        // Manual choices are valid - use them
        option.choices = manualChoices
      } else if (manualChoices) {
        // Only manual choices - use them
        option.choices = manualChoices
      } else if (derivedChoices) {
        // Only derived choices - use them
        option.choices = derivedChoices
      }

      options[optionName] = option
    }
  }

  return options
}

/**
 * Extracts enum values from a property of a type
 * Handles both union types ('a' | 'b') and TypeScript enums
 */
function extractEnumFromPropertyType(
  type: ts.Type,
  propertyName: string,
  typeChecker: TypeChecker
): string[] | null {
  // Get the property from the type
  const property = type.getProperty(propertyName)
  if (!property) {
    return null
  }

  // Get the type of the property
  const propertyType = typeChecker.getTypeOfSymbolAtLocation(
    property,
    property.valueDeclaration!
  )

  const enumValues: string[] = []

  // Check if it's a union type (e.g., 'debug' | 'info' | 'warn')
  if (propertyType.isUnion()) {
    for (const unionType of propertyType.types) {
      // Check if it's a string literal type
      if (unionType.flags & ts.TypeFlags.StringLiteral) {
        const literalType = unionType as ts.StringLiteralType
        enumValues.push(literalType.value)
      }
      // Check if it's an enum member (could be string or number enum)
      else if (unionType.flags & ts.TypeFlags.EnumLiteral) {
        const enumLiteralType = unionType as ts.LiteralType
        // For string enums, use the value directly
        if (typeof enumLiteralType.value === 'string') {
          enumValues.push(enumLiteralType.value)
        }
        // For numeric enums, get the symbol name (e.g., "Debug", "Info")
        else {
          const symbol = (unionType as any).symbol
          if (symbol && symbol.name) {
            enumValues.push(symbol.name)
          }
        }
      }
    }
  }
  // Check if it's an enum type directly
  else if (propertyType.flags & ts.TypeFlags.Enum) {
    const symbol = propertyType.getSymbol()
    if (symbol && symbol.exports) {
      symbol.exports.forEach((member) => {
        const memberType = typeChecker.getTypeOfSymbolAtLocation(
          member,
          member.valueDeclaration!
        )
        if (memberType.flags & ts.TypeFlags.StringLiteral) {
          const literalType = memberType as ts.StringLiteralType
          enumValues.push(literalType.value)
        } else if (typeof (memberType as any).value === 'string') {
          enumValues.push((memberType as any).value)
        }
      })
    }
  }
  // Check if it's an enum literal type
  else if (propertyType.flags & ts.TypeFlags.EnumLiteral) {
    const enumLiteralType = propertyType as ts.LiteralType
    if (typeof enumLiteralType.value === 'string') {
      enumValues.push(enumLiteralType.value)
    }
  }

  return enumValues.length > 0 ? enumValues : null
}

/**
 * Extracts enum values from the Config type
 */
function extractEnumFromConfigType(
  logger: InspectorLogger,
  propertyName: string,
  typeChecker: TypeChecker,
  inspectorState: InspectorState,
  _inspectorOptions: InspectorOptions
): string[] | null {
  // Look for Config type in typesLookup
  const configTypes = inspectorState.typesLookup.get('Config')
  if (!configTypes || configTypes.length === 0) {
    // Only warn once per CLI file to avoid spamming logs
    if (!configTypeWarningShown.has('missing-config-type')) {
      configTypeWarningShown.add('missing-config-type')
      logger.warn(
        `Could not find Config type in typesLookup. ` +
          `Make sure you have a Config interface extending CoreConfig in your codebase.`
      )
    }
    return null
  }

  // Use the first Config type (there should only be one)
  const configType = configTypes[0]
  if (!configType) {
    if (!configTypeWarningShown.has('undefined-config-type')) {
      configTypeWarningShown.add('undefined-config-type')
      logger.warn(`Config type is undefined in typesLookup.`)
    }
    return null
  }

  // Extract enum from the property
  return extractEnumFromPropertyType(configType, propertyName, typeChecker)
}

/**
 * Gets the property name from a property assignment
 */
function getPropertyName(prop: ts.PropertyAssignment): string | null {
  if (ts.isIdentifier(prop.name)) {
    return prop.name.text
  }
  if (ts.isStringLiteral(prop.name)) {
    return prop.name.text
  }
  return null
}

/**
 * Parses a parameters string to extract positional arguments
 * Parameters format: "<env> [region] [files...]"
 */
function parseCommandPattern(pattern: string): any[] {
  const positionals: any[] = []

  // Split by spaces to get all parameter definitions
  const parts = pattern.split(' ').filter((p) => p.trim())

  for (const part of parts) {
    if (part.startsWith('<') && part.endsWith('>')) {
      // Required positional
      const name = part.slice(1, -1)
      if (name.endsWith('...')) {
        positionals.push({
          name: name.slice(0, -3),
          required: true,
          variadic: true,
        })
      } else {
        positionals.push({
          name,
          required: true,
        })
      }
    } else if (part.startsWith('[') && part.endsWith(']')) {
      // Optional positional
      const name = part.slice(1, -1)
      if (name.endsWith('...')) {
        positionals.push({
          name: name.slice(0, -3),
          required: false,
          variadic: true,
        })
      } else {
        positionals.push({
          name,
          required: false,
        })
      }
    } else if (part.trim()) {
      // Found a literal word in the parameters pattern
      throw new Error(
        `Invalid parameters pattern '${pattern}': found literal word '${part}'. ` +
          `Parameters should only contain <required> or [optional] arguments. ` +
          `Example: "<env> [region]" or "<files...>"`
      )
    }
  }

  return positionals
}

/**
 * Adds CLI renderer metadata to the inspector state
 */
export const addCLIRenderers: AddWiring = (
  logger,
  node,
  typeChecker,
  inspectorState,
  options
) => {
  if (!ts.isCallExpression(node)) return

  const { expression, arguments: args, typeArguments } = node

  // Only handle pikkuCLIRender calls
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuCLIRender') {
    return
  }

  if (args.length === 0) return

  // Extract renderer name
  const { pikkuFuncId, exportedName } = extractFunctionName(
    node,
    typeChecker,
    inspectorState.rootDir
  )

  // Get the source file path
  const sourceFile = node.getSourceFile()
  const filePath = sourceFile.fileName

  // Extract services from type parameters (second type param is Services)
  const services: { optimized: boolean; services: string[] } = {
    optimized: true,
    services: [],
  }

  if (typeArguments && typeArguments.length >= 2) {
    // Second type parameter is the Services type
    const servicesTypeNode = typeArguments[1]
    if (servicesTypeNode) {
      const servicesType = typeChecker.getTypeFromTypeNode(servicesTypeNode)

      // Extract property names from the Services type
      const properties = servicesType.getProperties()
      for (const prop of properties) {
        services.services.push(prop.getName())
      }

      // If no specific services found, it might be using the full services object
      if (properties.length === 0) {
        services.optimized = false
      }
    }
  }

  // Store renderer metadata
  inspectorState.cli.meta.renderers[pikkuFuncId] = {
    name: pikkuFuncId,
    exportedName: exportedName ?? undefined,
    services,
    filePath,
  }

  // Add to files map if exported
  if (exportedName) {
    inspectorState.cli.files.add(filePath)
  }
}
