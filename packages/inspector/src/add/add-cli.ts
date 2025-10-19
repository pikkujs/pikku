import ts, { TypeChecker } from 'typescript'
import {
  AddWiring,
  InspectorLogger,
  InspectorOptions,
  InspectorState,
} from '../types.js'
import { CLIProgramMeta, CLICommandMeta, PikkuWiringTypes } from '@pikku/core'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { getPropertyValue } from '../utils/get-property-value.js'
import { matchesFilters } from '../utils/filter-utils.js'

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
  inspectorState.cli.meta[cliConfig.programName] = cliConfig.programMeta
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

  const filePath = sourceFile.fileName

  // Apply filters
  if (
    !matchesFilters(
      options.filters || {},
      { tags: programTags, name: programName },
      { type: PikkuWiringTypes.cli, name: programName, filePath },
      logger
    )
  ) {
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
        // Track that a default renderer exists
        programMeta.defaultRenderName = 'defaultRenderer'
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

  for (const prop of node.properties) {
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
      pikkuFuncName: extractFunctionName(
        node,
        typeChecker,
        inspectorState.rootDir
      ).pikkuFuncName,
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
    pikkuFuncName: '',
    positionals: [],
    options: {},
  }

  // First pass: extract pikkuFuncName and tags so we can use them when processing options/middleware
  let pikkuFuncName: string | undefined
  let optionsNode: ts.ObjectLiteralExpression | undefined
  let tags: string[] | undefined

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    if (propName === 'func') {
      pikkuFuncName = extractFunctionName(
        prop.initializer,
        typeChecker,
        inspectorState.rootDir
      ).pikkuFuncName
      meta.pikkuFuncName = pikkuFuncName
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
        ).pikkuFuncName
        break

      case 'options':
        // Process with pikkuFuncName from first pass
        if (optionsNode) {
          meta.options = processOptions(
            logger,
            optionsNode,
            typeChecker,
            inspectorState,
            options,
            pikkuFuncName
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
    }
  }

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
  pikkuFuncName?: string
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
      // Get the input type if we have a pikkuFuncName
      let inputTypes: ts.Type[] | undefined
      if (pikkuFuncName) {
        inputTypes = inspectorState.typesLookup.get(pikkuFuncName)
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
    logger.warn(
      `Warning: Could not find Config type in typesLookup for option "${propertyName}". ` +
        `Make sure you have a Config interface extending CoreConfig in your codebase.`
    )
    return null
  }

  // Use the first Config type (there should only be one)
  const configType = configTypes[0]
  if (!configType) {
    logger.warn(
      `Warning: Config type is undefined in typesLookup for option "${propertyName}".`
    )
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
