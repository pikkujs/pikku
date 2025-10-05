import ts, { TypeChecker } from 'typescript'
import { InspectorState } from './types.js'
import { CLIProgramMeta, CLICommandMeta } from '@pikku/core'
import { extractFunctionName } from './utils.js'

/**
 * Adds CLI command metadata to the inspector state
 */
export function addCLI(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  inspectorState: InspectorState,
  typeChecker: TypeChecker
): void {
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

  // Add to files set
  inspectorState.cli.files.add(sourceFile.fileName)

  // Process the CLI configuration
  const cliConfig = processCLIConfig(arg, sourceFile, typeChecker)

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
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker
): { programName: string; programMeta: CLIProgramMeta } | null {
  let programName = ''
  const programMeta: CLIProgramMeta = {
    program: '',
    commands: {},
    options: {},
  }

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    switch (propName) {
      case 'program':
        if (ts.isStringLiteral(prop.initializer)) {
          programName = prop.initializer.text
          programMeta.program = programName
        }
        break

      case 'commands':
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          programMeta.commands = processCommands(
            prop.initializer,
            sourceFile,
            typeChecker,
            programName
          )
        }
        break

      case 'options':
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          programMeta.options = processOptions(
            prop.initializer,
            sourceFile,
            typeChecker
          )
        }
        break

      case 'render':
        // Track that a default renderer exists
        programMeta.defaultRenderName = 'defaultRenderer'
        break
    }
  }

  if (!programName) {
    return null
  }

  return { programName, programMeta }
}

/**
 * Processes the commands object
 */
function processCommands(
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker,
  programName: string
): Record<string, CLICommandMeta> {
  const commands: Record<string, CLICommandMeta> = {}

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const commandName = getPropertyName(prop)
    if (!commandName) continue

    const commandMeta = processCommand(
      commandName,
      prop.initializer,
      sourceFile,
      typeChecker,
      programName
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
  name: string,
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker,
  programName: string,
  parentPath: string[] = []
): CLICommandMeta | null {
  const fullPath = [...parentPath, name]

  // Handle shorthand (just a function)
  if (
    ts.isIdentifier(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  ) {
    return {
      pikkuFuncName: extractFunctionName(node, typeChecker).pikkuFuncName,
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
        name,
        node.arguments[0],
        sourceFile,
        typeChecker,
        programName,
        parentPath
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

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (!ts.isIdentifier(prop.name)) continue

    const propName = prop.name.text

    switch (propName) {
      case 'command':
        if (ts.isStringLiteral(prop.initializer)) {
          meta.command = prop.initializer.text
          meta.positionals = parseCommandPattern(prop.initializer.text)
        }
        break

      case 'description':
        if (ts.isStringLiteral(prop.initializer)) {
          meta.description = prop.initializer.text
        }
        break

      case 'func':
        meta.pikkuFuncName = extractFunctionName(
          prop.initializer,
          typeChecker
        ).pikkuFuncName
        break

      case 'render':
        meta.renderName = extractFunctionName(
          prop.initializer,
          typeChecker
        ).pikkuFuncName
        break

      case 'options':
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          meta.options = processOptions(
            prop.initializer,
            sourceFile,
            typeChecker
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
              subName,
              subProp.initializer,
              sourceFile,
              typeChecker,
              programName,
              fullPath
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
 * Processes CLI options
 */
function processOptions(
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  typeChecker: TypeChecker
): Record<string, any> {
  const options: Record<string, any> = {}

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue

    const optionName = getPropertyName(prop)
    if (!optionName) continue

    if (ts.isObjectLiteralExpression(prop.initializer)) {
      const option: any = {}

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
        }
      }

      options[optionName] = option
    }
  }

  return options
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
 * Parses a command pattern to extract positional arguments
 */
function parseCommandPattern(pattern: string): any[] {
  const positionals: any[] = []

  // Remove command name (first word)
  const parts = pattern.split(' ').slice(1)

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
      // Found a non-positional word in the command pattern
      const commandName = pattern.split(' ')[0]
      const remainingParts = parts.slice(parts.indexOf(part))
      throw new Error(
        `Invalid command pattern '${pattern}': found literal word '${part}' after command name. ` +
          `Use subcommands for nested command structures instead of multiple words in the command pattern. ` +
          `Example: Instead of "${commandName} ${remainingParts.join(' ')}", use subcommands: { ${part}: { command: "${remainingParts.join(' ')}", ... } }`
      )
    }
  }

  return positionals
}
