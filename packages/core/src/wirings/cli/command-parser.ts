import type {
  CLIMeta,
  CLIProgramMeta,
  CLICommandMeta,
  CLIPositional,
  CLIOption,
  CLIOptionType,
} from './cli.types.js'
import { pikkuState } from '../../pikku-state.js'

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

/**
 * A real short-flag cluster is a handful of characters (`-abc`). Anything past
 * this is treated as a single malformed token rather than scanned per
 * character — the parser runs over untrusted CLI-channel frames, and a
 * multi-megabyte `-aaaa…` would otherwise be O(length) work that also pushed
 * one error per character.
 */
const MAX_SHORT_FLAG_CLUSTER = 64

function resolveOptionType(optionDef: CLIOption): CLIOptionType {
  if (optionDef.type) {
    return optionDef.type
  }
  if (typeof optionDef.default === 'boolean') {
    return 'boolean'
  }
  if (typeof optionDef.default === 'number') {
    return 'number'
  }
  return 'string'
}

/**
 * A command's options are keys of its function's input, so the input schema
 * already records what each one is. Reading it here means a declaration never
 * has to repeat — or contradict — the type the function is validated against.
 * An explicit `type` still wins, and an option the schema says nothing about
 * (a program-level option belonging to no function input) is left untouched.
 */
function applySchemaOptionTypes(
  options: Record<string, CLIOption>,
  commandMeta: CLICommandMeta
): Record<string, CLIOption> {
  const properties = commandInputProperties(commandMeta)
  if (!properties) {
    return options
  }

  const typed: Record<string, CLIOption> = { ...options }
  for (const [name, option] of Object.entries(typed)) {
    if (option.type) {
      continue
    }
    const schemaType = optionTypeFromSchema(properties[name])
    if (schemaType) {
      typed[name] = { ...option, type: schemaType }
    }
  }
  return typed
}

function commandInputProperties(
  commandMeta: CLICommandMeta
): Record<string, any> | null {
  const funcMeta = pikkuState(null, 'function', 'meta')[commandMeta.pikkuFuncId]
  const schemaName = funcMeta?.inputSchemaName
  if (!schemaName) {
    return null
  }
  const schema = pikkuState(
    funcMeta.packageName ?? null,
    'misc',
    'schemas'
  ).get(schemaName)
  const properties = schema?.properties
  return properties && typeof properties === 'object' ? properties : null
}

function optionTypeFromSchema(property: any): CLIOptionType | undefined {
  if (!property || typeof property !== 'object') {
    return undefined
  }
  // An optional field can arrive as a union with null, which is not a shape the
  // parser can read a value into.
  const declared = Array.isArray(property.type)
    ? property.type.filter((entry: unknown) => entry !== 'null')[0]
    : property.type

  switch (declared) {
    case 'array':
      return 'string[]'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'string':
      return 'string'
    default:
      return undefined
  }
}

const BOOLEAN_LITERALS = new Map<string, boolean>([
  ['true', true],
  ['false', false],
  ['1', true],
  ['0', false],
  ['yes', true],
  ['no', false],
])

/**
 * A boolean option is a flag, but `--watch false` is how scripts and CI turn a
 * default-on flag off, so an explicit literal directly after the flag is taken
 * as its value rather than left behind as a positional.
 */
function readBooleanLiteral(raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined
  }
  return BOOLEAN_LITERALS.get(raw.toLowerCase())
}

function readOptionValue(raw: string, optionDef: CLIOption): any {
  if (resolveOptionType(optionDef) !== 'string[]') {
    return parseOptionValue(raw, optionDef)
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => parseOptionValue(item, optionDef))
}

/** A repeated array option accumulates rather than replacing. */
function assignOptionValue(
  optionArgs: Record<string, any>,
  key: string,
  value: any
) {
  const existing = optionArgs[key]
  if (Array.isArray(existing) && Array.isArray(value)) {
    optionArgs[key] = [...existing, ...value]
  } else {
    optionArgs[key] = value
  }
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

  const availableOptions = applySchemaOptionTypes(
    collectAvailableOptions(meta, result.commandPath),
    commandMeta
  )

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
        availableOptions[negatedKey] &&
        resolveOptionType(availableOptions[negatedKey]) === 'boolean'
      ) {
        // Requiring a boolean type keeps a literal `--no-something` option
        // name parsing as itself rather than as a negation.
        optionArgs[negatedKey] = false
      } else if (equalIndex > 0) {
        const key = toCamelCase(arg.slice(2, equalIndex))
        const optionDef = availableOptions[key]

        if (!optionDef) {
          warnUnknownOption(arg.slice(2, equalIndex), availableOptions, result)
        }

        const value = arg.slice(equalIndex + 1)
        if (optionDef) {
          assignOptionValue(optionArgs, key, readOptionValue(value, optionDef))
        } else {
          optionArgs[key] = parseOptionValue(value, optionDef)
        }
      } else {
        const key = toCamelCase(arg.slice(2))
        const optionDef = availableOptions[key]

        if (!optionDef) {
          warnUnknownOption(arg.slice(2), availableOptions, result)
        }

        if (!optionDef) {
          // With no spec there is nothing to consult, so the lookahead
          // heuristic is all that is left.
          if (
            currentIndex + 1 < args.length &&
            !args[currentIndex + 1].startsWith('-')
          ) {
            currentIndex++
            optionArgs[key] = parseOptionValue(args[currentIndex], optionDef)
          } else {
            optionArgs[key] = true
          }
        } else if (resolveOptionType(optionDef) === 'boolean') {
          const literal = readBooleanLiteral(args[currentIndex + 1])
          if (literal === undefined) {
            optionArgs[key] = true
          } else {
            currentIndex++
            optionArgs[key] = literal
          }
        } else if (currentIndex + 1 < args.length) {
          currentIndex++
          assignOptionValue(
            optionArgs,
            key,
            readOptionValue(args[currentIndex], optionDef)
          )
        } else {
          optionArgs[key] = true
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      if (arg.length > MAX_SHORT_FLAG_CLUSTER) {
        result.errors.push(
          `Unknown option: ${arg.slice(0, MAX_SHORT_FLAG_CLUSTER)}… (too long)`
        )
        currentIndex++
        continue
      }
      for (let i = 1; i < arg.length; i++) {
        const shortFlag = arg[i]

        const longOption = findLongOption(shortFlag, availableOptions)
        if (longOption) {
          const optionDef = availableOptions[longOption]
          // Only the last flag in a cluster can take a value.
          const isLast = i === arg.length - 1
          const literal =
            isLast && resolveOptionType(optionDef) === 'boolean'
              ? readBooleanLiteral(args[currentIndex + 1])
              : undefined

          if (literal !== undefined) {
            currentIndex++
            optionArgs[longOption] = literal
          } else if (
            isLast &&
            resolveOptionType(optionDef) !== 'boolean' &&
            currentIndex + 1 < args.length
          ) {
            currentIndex++
            assignOptionValue(
              optionArgs,
              longOption,
              readOptionValue(args[currentIndex], optionDef)
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

  const optionType = resolveOptionType(optionDef)
  if (optionType === 'boolean') {
    return readBooleanLiteral(value) ?? false
  }
  if (optionType === 'number') {
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
