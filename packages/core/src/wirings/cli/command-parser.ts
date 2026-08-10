import type {
  CLIMeta,
  CLIProgramMeta,
  CLICommandMeta,
  CLIPositional,
  CLIOption,
} from './cli.types.js'

/** "from-plan" → "fromPlan"; the parser accepts either spelling. */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** Options the runner handles itself — never reported as unknown. */
const RESERVED_OPTIONS = new Set(['help'])

/** Naive O(n*m); only ever used to suggest a near-miss option name. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = row
  }
  return prev[b.length]
}

/** Returns null beyond a distance of 2. */
function suggestOption(
  typed: string,
  availableOptions: Record<string, CLIOption>
): string | null {
  let best: string | null = null
  let bestDistance = 3

  for (const name of Object.keys(availableOptions)) {
    const kebab = toKebabCase(name)
    const distance = Math.min(
      levenshtein(typed, kebab),
      levenshtein(typed, name)
    )
    if (distance < bestDistance) {
      bestDistance = distance
      best = kebab
    }
  }

  return best
}

// knowledge: decisions/internals/cli-unknown-long-options-warn-instead-of-failing.md
function warnUnknownOption(
  typed: string,
  availableOptions: Record<string, CLIOption>,
  result: ParsedCommand
) {
  if (RESERVED_OPTIONS.has(toCamelCase(typed))) {
    return
  }

  const suggestion = suggestOption(typed, availableOptions)
  result.warnings.push(
    `Unknown option: --${typed} (ignored)` +
      (suggestion ? ` Did you mean --${suggestion}?` : '')
  )
}

export interface ParsedCommand {
  program: string
  commandPath: string[]
  positionals: Record<string, any>
  options: Record<string, any>
  errors: string[]
  /** Non-fatal: the command still runs. */
  warnings: string[]
}

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
    warnings: [],
  }

  const meta = allMeta.programs[programName]
  if (!meta) {
    result.errors.push(`Program not found: ${programName}`)
    return result
  }

  let currentIndex = 0
  let currentMeta = meta

  while (currentIndex < args.length && !args[currentIndex].startsWith('-')) {
    const arg = args[currentIndex]

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
      break
    }
  }

  // A default command only applies when the user named no command at all.
  const hasNonFlagArgs = args.some(
    (arg, idx) => idx >= currentIndex && !arg.startsWith('-')
  )
  if (result.commandPath.length === 0 && meta.commands && !hasNonFlagArgs) {
    for (const [name, cmd] of Object.entries(meta.commands)) {
      if (cmd.isDefault) {
        result.commandPath.push(name)
        currentMeta = {
          program: currentMeta.program,
          commands: cmd.subcommands || {},
          options: {
            ...currentMeta.options,
            ...cmd.options,
          },
          defaultRenderName: cmd.renderName || currentMeta.defaultRenderName,
        }
        break
      }
    }
  }

  const commandMeta = getCommandMeta(meta, result.commandPath)
  if (!commandMeta) {
    if (
      result.commandPath.length === 0 &&
      hasNonFlagArgs &&
      args.length > 0 &&
      !args[0].startsWith('-')
    ) {
      result.errors.push(`Unknown command: ${args[0]}`)
    } else {
      result.errors.push(`Unknown command: ${result.commandPath.join(' ')}`)
    }
    return result
  }

  // knowledge: decisions/internals/cli-parse-errors-are-routed-by-message-prefix.md
  if (
    !commandMeta.pikkuFuncId &&
    commandMeta.subcommands &&
    Object.keys(commandMeta.subcommands).length > 0
  ) {
    result.errors.push(`Missing subcommand: ${result.commandPath.join(' ')}`)
    return result
  }

  const availableOptions = collectAvailableOptions(meta, result.commandPath)

  const positionalArgs: string[] = []
  const optionArgs: Record<string, any> = {}

  while (currentIndex < args.length) {
    const arg = args[currentIndex]

    if (arg.startsWith('--')) {
      const negatedKey = arg.startsWith('--no-')
        ? toCamelCase(arg.slice(5))
        : undefined
      const equalIndex = arg.indexOf('=')
      if (
        negatedKey &&
        typeof availableOptions[negatedKey]?.default === 'boolean'
      ) {
        // Requiring a boolean default keeps a literal `--no-something` option
        // name parsing as itself rather than as a negation.
        optionArgs[negatedKey] = false
      } else if (equalIndex > 0) {
        const key = toCamelCase(arg.slice(2, equalIndex))
        const optionDef = availableOptions[key]

        if (!optionDef) {
          warnUnknownOption(arg.slice(2, equalIndex), availableOptions, result)
        }

        const value = arg.slice(equalIndex + 1)
        optionArgs[key] = parseOptionValue(value, optionDef)
      } else {
        const key = toCamelCase(arg.slice(2))
        const optionDef = availableOptions[key]

        if (!optionDef) {
          warnUnknownOption(arg.slice(2), availableOptions, result)
        }

        if (optionDef && optionDef.array) {
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
          currentIndex++
          optionArgs[key] = parseOptionValue(args[currentIndex], optionDef)
        } else {
          optionArgs[key] = true
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (let i = 1; i < arg.length; i++) {
        const shortFlag = arg[i]

        const longOption = findLongOption(shortFlag, availableOptions)
        if (longOption) {
          // Only the last flag in a cluster can take a value.
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
            optionArgs[longOption] = true
          }
        } else {
          result.errors.push(`Unknown option: -${shortFlag}`)
        }
      }
    } else {
      positionalArgs.push(arg)
    }

    currentIndex++
  }

  mapPositionalArguments(commandMeta.positionals, positionalArgs, result)

  applyOptionDefaults(availableOptions, optionArgs, result)

  result.options = optionArgs

  return result
}

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

function collectAvailableOptions(
  meta: CLIProgramMeta,
  path: string[]
): Record<string, CLIOption> {
  let options: Record<string, CLIOption> = { ...meta.options }

  if (path.length === 0) {
    return options
  }

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

function parseOptionValue(value: string, optionDef?: CLIOption): any {
  if (!optionDef) {
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^\d+$/.test(value)) return parseInt(value, 10)
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value)
    return value
  }

  const defaultValue = optionDef.default
  if (typeof defaultValue === 'boolean') {
    return value === 'true' || value === '1' || value === 'yes'
  }
  if (typeof defaultValue === 'number') {
    return parseFloat(value)
  }

  if (optionDef.choices && !optionDef.choices.includes(value as never)) {
    // Deliberately not an error here — applyOptionDefaults reports bad choices.
    return value
  }

  return value
}

function mapPositionalArguments(
  positionalDefs: CLIPositional[],
  args: string[],
  result: ParsedCommand
) {
  let argIndex = 0

  for (const def of positionalDefs) {
    if (def.variadic) {
      if (argIndex < args.length) {
        result.positionals[def.name] = args.slice(argIndex)
        argIndex = args.length
      } else if (def.required) {
        result.errors.push(`Missing required argument: ${def.name}`)
      } else {
        result.positionals[def.name] = []
      }
    } else {
      if (argIndex < args.length) {
        result.positionals[def.name] = args[argIndex]
        argIndex++
      } else if (def.required) {
        result.errors.push(`Missing required argument: ${def.name}`)
      }
    }
  }

  if (argIndex < args.length) {
    result.errors.push(
      `Unexpected arguments: ${args.slice(argIndex).join(' ')}`
    )
  }
}

function applyOptionDefaults(
  optionDefs: Record<string, CLIOption>,
  options: Record<string, any>,
  result: ParsedCommand
) {
  for (const [name, def] of Object.entries(optionDefs)) {
    if (!(name in options) && def.default !== undefined) {
      options[name] = def.default
    }

    if (def.required && !(name in options)) {
      result.errors.push(`Missing required option: --${toKebabCase(name)}`)
    }

    if (def.choices && name in options) {
      const value = options[name]
      if (Array.isArray(value)) {
        for (const v of value) {
          if (!def.choices.includes(v)) {
            result.errors.push(
              `Invalid value for --${toKebabCase(name)}: ${v}. Valid choices: ${def.choices.join(', ')}`
            )
          }
        }
      } else if (!def.choices.includes(value)) {
        result.errors.push(
          `Invalid value for --${toKebabCase(name)}: ${value}. Valid choices: ${def.choices.join(', ')}`
        )
      }
    }
  }
}

export function generateCommandHelp(
  programName: string,
  allMeta: CLIMeta,
  commandPath: string[] = []
): string {
  const lines: string[] = []
  const meta = allMeta.programs[programName]

  if (!meta) {
    return `Program not found: ${programName}`
  }

  if (commandPath.length === 0) {
    lines.push(`Usage: ${programName} <command> [options]`)
    lines.push('')
    lines.push('Commands:')

    for (const [name, cmd] of Object.entries(meta.commands)) {
      const desc = cmd.description || ''
      const defaultMarker = cmd.isDefault ? ' (default)' : ''
      lines.push(`  ${name.padEnd(20)} ${desc}${defaultMarker}`)
    }

    if (Object.keys(meta.options).length > 0) {
      lines.push('')
      lines.push('Options:')
      formatOptions(meta.options, lines)
    }
  } else {
    const commandMeta = getCommandMeta(meta, commandPath)
    if (!commandMeta) {
      return `Unknown command: ${commandPath.join(' ')}`
    }

    let usage = `${programName} ${commandPath.join(' ')}`
    if (commandMeta.parameters) {
      usage += ' ' + commandMeta.parameters
    }
    lines.push(`Usage: ${usage} [options]`)

    if (commandMeta.description) {
      lines.push('')
      lines.push(commandMeta.description)
    }

    if (commandMeta.positionals.length > 0) {
      lines.push('')
      lines.push('Arguments:')
      for (const pos of commandMeta.positionals) {
        const marker = pos.required ? '<required>' : '[optional]'
        const variadic = pos.variadic ? '...' : ''
        lines.push(`  ${pos.name}${variadic} ${marker}`)
      }
    }

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

    const availableOptions = collectAvailableOptions(meta, commandPath)
    if (Object.keys(availableOptions).length > 0) {
      lines.push('')
      lines.push('Options:')
      formatOptions(availableOptions, lines)
    }
  }

  return lines.join('\n')
}

function formatOptions(options: Record<string, CLIOption>, lines: string[]) {
  for (const [name, opt] of Object.entries(options)) {
    let line = '  '
    if (opt.short) {
      line += `-${opt.short}, `
    } else {
      line += '    '
    }
    line += `--${toKebabCase(name)}`

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
