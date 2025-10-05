import {
  CLIMeta,
  CLIProgramMeta,
  CLICommandMeta,
  CLIPositional,
  CLIOption,
} from './cli.types.js'

/**
 * Result of parsing CLI arguments
 */
export interface ParsedCommand {
  program: string
  commandPath: string[]
  positionals: Record<string, any>
  options: Record<string, any>
  errors: string[]
}

/**
 * Parses raw CLI arguments into structured data for a specific program
 */
export function parseCLIArguments(
  args: string[],
  programName: string,
  allMeta: CLIMeta
): ParsedCommand {
  const result: ParsedCommand = {
    program: programName,
    commandPath: [],
    positionals: {},
    options: {},
    errors: [],
  }

  const meta = allMeta[programName]
  if (!meta) {
    result.errors.push(`Program not found: ${programName}`)
    return result
  }

  let currentIndex = 0
  let currentMeta = meta

  // Parse command path (non-flag arguments at the beginning)
  while (currentIndex < args.length && !args[currentIndex].startsWith('-')) {
    const arg = args[currentIndex]

    // Check if this is a known subcommand
    if (currentMeta.commands && currentMeta.commands[arg]) {
      result.commandPath.push(arg)
      currentMeta = {
        program: currentMeta.program,
        commands: currentMeta.commands[arg].subcommands || {},
        options: {
          ...currentMeta.options,
          ...currentMeta.commands[arg].options,
        },
        defaultRenderName:
          currentMeta.commands[arg].renderName || currentMeta.defaultRenderName,
      }
      currentIndex++
    } else {
      // Not a subcommand, must be a positional argument
      break
    }
  }

  // Get the final command metadata
  const commandMeta = getCommandMeta(meta, result.commandPath)
  if (!commandMeta) {
    result.errors.push(`Unknown command: ${result.commandPath.join(' ')}`)
    return result
  }

  // Collect all available options (global + inherited)
  const availableOptions = collectAvailableOptions(meta, result.commandPath)

  // Parse remaining arguments as positionals and options
  const positionalArgs: string[] = []
  const optionArgs: Record<string, any> = {}

  while (currentIndex < args.length) {
    const arg = args[currentIndex]

    if (arg.startsWith('--')) {
      // Long option
      const equalIndex = arg.indexOf('=')
      if (equalIndex > 0) {
        // --option=value format
        const key = arg.slice(2, equalIndex)
        const value = arg.slice(equalIndex + 1)
        optionArgs[key] = parseOptionValue(value, availableOptions[key])
      } else {
        // --option value format
        const key = arg.slice(2)
        const optionDef = availableOptions[key]

        if (optionDef && optionDef.array) {
          // Array option - collect all following non-flag values
          currentIndex++
          const values: any[] = []
          while (
            currentIndex < args.length &&
            !args[currentIndex].startsWith('-')
          ) {
            values.push(parseOptionValue(args[currentIndex], optionDef))
            currentIndex++
          }
          currentIndex-- // Back up one since we'll increment at loop end
          optionArgs[key] = values
        } else if (
          currentIndex + 1 < args.length &&
          !args[currentIndex + 1].startsWith('-')
        ) {
          // Next arg is the value
          currentIndex++
          optionArgs[key] = parseOptionValue(args[currentIndex], optionDef)
        } else {
          // Boolean flag
          optionArgs[key] = true
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short option(s)
      for (let i = 1; i < arg.length; i++) {
        const shortFlag = arg[i]

        // Find the corresponding long option
        const longOption = findLongOption(shortFlag, availableOptions)
        if (longOption) {
          // Check if this is the last character and there's a value
          if (
            i === arg.length - 1 &&
            currentIndex + 1 < args.length &&
            !args[currentIndex + 1].startsWith('-')
          ) {
            currentIndex++
            optionArgs[longOption] = parseOptionValue(
              args[currentIndex],
              availableOptions[longOption]
            )
          } else {
            // Boolean flag
            optionArgs[longOption] = true
          }
        } else {
          result.errors.push(`Unknown option: -${shortFlag}`)
        }
      }
    } else {
      // Positional argument
      positionalArgs.push(arg)
    }

    currentIndex++
  }

  // Map positional arguments to named parameters
  mapPositionalArguments(commandMeta.positionals, positionalArgs, result)

  // Apply option defaults and validation
  applyOptionDefaults(availableOptions, optionArgs, result)

  result.options = optionArgs

  return result
}

/**
 * Gets the command metadata for a given path
 */
function getCommandMeta(
  meta: CLIProgramMeta,
  path: string[]
): CLICommandMeta | null {
  if (path.length === 0) {
    return null
  }

  let current = meta.commands[path[0]]
  if (!current) {
    return null
  }

  for (let i = 1; i < path.length; i++) {
    if (!current.subcommands || !current.subcommands[path[i]]) {
      return null
    }
    current = current.subcommands[path[i]]
  }

  return current
}

/**
 * Collects all available options through the inheritance chain
 */
function collectAvailableOptions(
  meta: CLIProgramMeta,
  path: string[]
): Record<string, CLIOption> {
  let options: Record<string, CLIOption> = { ...meta.options }

  if (path.length === 0) {
    return options
  }

  // Walk through the command path, merging options
  let current = meta.commands[path[0]]
  if (current) {
    options = { ...options, ...current.options }

    for (let i = 1; i < path.length; i++) {
      if (current.subcommands && current.subcommands[path[i]]) {
        current = current.subcommands[path[i]]
        options = { ...options, ...current.options }
      }
    }
  }

  return options
}

/**
 * Finds the long option name for a short flag
 */
function findLongOption(
  shortFlag: string,
  options: Record<string, CLIOption>
): string | null {
  for (const [name, option] of Object.entries(options)) {
    if (option.short === shortFlag) {
      return name
    }
  }
  return null
}

/**
 * Parses an option value based on its definition
 */
function parseOptionValue(value: string, optionDef?: CLIOption): any {
  if (!optionDef) {
    // No definition, try to infer type
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^\d+$/.test(value)) return parseInt(value, 10)
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value)
    return value
  }

  // Use default type from option definition
  const defaultValue = optionDef.default
  if (typeof defaultValue === 'boolean') {
    return value === 'true' || value === '1' || value === 'yes'
  }
  if (typeof defaultValue === 'number') {
    return parseFloat(value)
  }

  // Check choices
  if (optionDef.choices && !optionDef.choices.includes(value as any)) {
    // Invalid choice, but return anyway (validation will catch it)
    return value
  }

  return value
}

/**
 * Maps positional arguments to named parameters
 */
function mapPositionalArguments(
  positionalDefs: CLIPositional[],
  args: string[],
  result: ParsedCommand
) {
  let argIndex = 0

  for (const def of positionalDefs) {
    if (def.variadic) {
      // Collect all remaining arguments
      if (argIndex < args.length) {
        result.positionals[def.name] = args.slice(argIndex)
        argIndex = args.length
      } else if (def.required) {
        result.errors.push(`Missing required argument: ${def.name}`)
      } else {
        result.positionals[def.name] = []
      }
    } else {
      // Single argument
      if (argIndex < args.length) {
        result.positionals[def.name] = args[argIndex]
        argIndex++
      } else if (def.required) {
        result.errors.push(`Missing required argument: ${def.name}`)
      }
    }
  }

  // Check for extra positional arguments
  if (argIndex < args.length) {
    result.errors.push(
      `Unexpected arguments: ${args.slice(argIndex).join(' ')}`
    )
  }
}

/**
 * Applies option defaults and validates choices
 */
function applyOptionDefaults(
  optionDefs: Record<string, CLIOption>,
  options: Record<string, any>,
  result: ParsedCommand
) {
  for (const [name, def] of Object.entries(optionDefs)) {
    // Apply default if not provided
    if (!(name in options) && def.default !== undefined) {
      options[name] = def.default
    }

    // Check required
    if (def.required && !(name in options)) {
      result.errors.push(`Missing required option: --${name}`)
    }

    // Validate choices
    if (def.choices && name in options) {
      const value = options[name]
      if (Array.isArray(value)) {
        for (const v of value) {
          if (!def.choices.includes(v)) {
            result.errors.push(
              `Invalid value for --${name}: ${v}. Valid choices: ${def.choices.join(', ')}`
            )
          }
        }
      } else if (!def.choices.includes(value)) {
        result.errors.push(
          `Invalid value for --${name}: ${value}. Valid choices: ${def.choices.join(', ')}`
        )
      }
    }
  }
}

/**
 * Generates help text for a command in a specific program
 */
export function generateCommandHelp(
  programName: string,
  allMeta: CLIMeta,
  commandPath: string[] = []
): string {
  const lines: string[] = []
  const meta = allMeta[programName]

  if (!meta) {
    return `Program not found: ${programName}`
  }

  if (commandPath.length === 0) {
    // Root help for the program
    lines.push(`Usage: ${programName} <command> [options]`)
    lines.push('')
    lines.push('Commands:')

    for (const [name, cmd] of Object.entries(meta.commands)) {
      const desc = cmd.description || ''
      lines.push(`  ${name.padEnd(20)} ${desc}`)
    }

    if (Object.keys(meta.options).length > 0) {
      lines.push('')
      lines.push('Options:')
      formatOptions(meta.options, lines)
    }
  } else {
    // Command-specific help
    const commandMeta = getCommandMeta(meta, commandPath)
    if (!commandMeta) {
      return `Unknown command: ${commandPath.join(' ')}`
    }

    // Usage line
    let usage = `${programName} ${commandPath.join(' ')}`
    if (commandMeta.command) {
      const parts = commandMeta.command.split(' ').slice(1) // Remove command name
      if (parts.length > 0) {
        usage += ' ' + parts.join(' ')
      }
    }
    lines.push(`Usage: ${usage} [options]`)

    if (commandMeta.description) {
      lines.push('')
      lines.push(commandMeta.description)
    }

    // Positional arguments
    if (commandMeta.positionals.length > 0) {
      lines.push('')
      lines.push('Arguments:')
      for (const pos of commandMeta.positionals) {
        const marker = pos.required ? '<required>' : '[optional]'
        const variadic = pos.variadic ? '...' : ''
        lines.push(`  ${pos.name}${variadic} ${marker}`)
      }
    }

    // Subcommands
    if (
      commandMeta.subcommands &&
      Object.keys(commandMeta.subcommands).length > 0
    ) {
      lines.push('')
      lines.push('Subcommands:')
      for (const [name, sub] of Object.entries(commandMeta.subcommands)) {
        const desc = sub.description || ''
        lines.push(`  ${name.padEnd(20)} ${desc}`)
      }
    }

    // Options
    const availableOptions = collectAvailableOptions(meta, commandPath)
    if (Object.keys(availableOptions).length > 0) {
      lines.push('')
      lines.push('Options:')
      formatOptions(availableOptions, lines)
    }
  }

  return lines.join('\n')
}

/**
 * Formats options for help text
 */
function formatOptions(options: Record<string, CLIOption>, lines: string[]) {
  for (const [name, opt] of Object.entries(options)) {
    let line = '  '
    if (opt.short) {
      line += `-${opt.short}, `
    } else {
      line += '    '
    }
    line += `--${name}`

    if (opt.default !== undefined && typeof opt.default !== 'boolean') {
      line += ` <value>`
    }

    line = line.padEnd(30)
    line += opt.description || ''

    if (opt.default !== undefined) {
      line += ` (default: ${JSON.stringify(opt.default)})`
    }

    if (opt.choices) {
      line += ` [choices: ${opt.choices.join(', ')}]`
    }

    lines.push(line)
  }
}
