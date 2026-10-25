import type { ContractChange } from './contract.js'
import { diffMocks, findFunction, type SurfaceView } from './diff.js'
import {
  MOCK_STATES,
  type Mock,
  type MockMeta,
  type MockState,
} from './read.js'

export interface AddMockInput {
  rpc: string
  state?: string
  name?: string
  label?: string
  description?: string
  default?: boolean
  status?: number
  flag?: string
  /** The body as JSON text. */
  body?: string
  /** The body, already parsed (from `--from`). */
  data?: { value: unknown }
  force?: boolean
}

export interface AddMockPlan {
  rpc: string
  name: string
  state: MockState
  data: unknown
  meta: MockMeta
  /** Other mocks of this RPC whose `default: true` has to be cleared. */
  clearDefault: string[]
  /** An existing mock this one replaces (only with `force`). */
  replaces: boolean
  hook: 'usePikkuQueryStub' | 'usePikkuMutationStub'
  /** How the body compares to the function's output. `checked: false` when there is no function schema to compare with. */
  shape: { checked: boolean; invalid: string[]; changes: ContractChange[] }
  warnings: string[]
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
export const FLAG_NAME = /^[A-Za-z][A-Za-z0-9]*$/

const LABELS: Record<MockState, string> = {
  healthy: 'Healthy',
  empty: 'Empty',
  error: 'Error',
  slow: 'Slow',
}

const DESCRIPTIONS: Record<MockState, string> = {
  healthy: 'Typical data',
  empty: 'Nothing to show yet',
  error: 'The request fails',
  slow: 'The request is slow to answer',
}

const READ_NAME =
  /^(get|list|find|search|read|fetch|count|load|query|is|has|check)([A-Z0-9_]|$)/

/** A function marked readonly is a query; one that is not is a query only when its name reads like one. */
const isQuery = (rpc: string, readonly?: boolean): boolean =>
  readonly === true || READ_NAME.test(rpc.split(':').pop()!)

/** The RPC names a mock can be added for, sorted. */
export const availableRpcs = (surface: SurfaceView): string[] => {
  const all = Object.values(surface.functions).filter((fn) => !fn.platform)
  const exposed = all.filter((fn) => fn.expose)
  return [
    ...new Set((exposed.length ? exposed : all).map((fn) => fn.key)),
  ].sort()
}

/** The error to throw when `rpc` is not a function of the project. */
export const unknownRpcMessage = (
  surface: SurfaceView,
  rpc: string
): string => {
  const names = availableRpcs(surface)
  const alt = rpc.replace('.', ':')
  const hint =
    alt !== rpc && findFunction(surface, alt)
      ? ` Did you mean ${alt}? (RPC names use ":", the folder uses ".")`
      : ''
  const shown = names.slice(0, 60)
  return `No function "${rpc}" in this project.${hint} Available RPCs (${names.length}): ${
    names.length
      ? shown.join(', ') +
        (names.length > shown.length
          ? `, and ${names.length - shown.length} more`
          : '')
      : 'none, run pikku all first'
  }`
}

const isArrayOutput = (surface: SurfaceView, rpc: string): boolean => {
  const fn = findFunction(surface, rpc)
  const schema = fn?.outputSchemaName
    ? (surface.schemas[fn.outputSchemaName] as { type?: unknown } | undefined)
    : undefined
  return !!schema && [schema.type].flat().includes('array')
}

/**
 * Decides everything `pikku mocks add` writes, without touching disk.
 * `known` is false for an RPC with no function in this project (an addon's).
 */
export const planAddMock = (
  input: AddMockInput,
  surface: SurfaceView,
  existing: Mock[],
  known: boolean
): AddMockPlan => {
  const state = (input.state ?? 'healthy') as MockState
  if (!MOCK_STATES.includes(state)) {
    throw new Error(
      `--state must be one of ${MOCK_STATES.join(', ')}, got "${input.state}"`
    )
  }
  const name = input.name ?? state
  if (!NAME.test(name)) {
    throw new Error(
      `Mock name "${name}" must be letters, digits, "-" or "_", it becomes the file name`
    )
  }
  if (input.flag !== undefined && !FLAG_NAME.test(input.flag)) {
    throw new Error(
      `Flag "${input.flag}" must be a camelCase identifier (letters and digits), such as assistantPanel`
    )
  }
  if (input.body !== undefined && input.data !== undefined) {
    throw new Error('Pass --body or --from, not both')
  }
  if (input.status !== undefined && !Number.isInteger(input.status)) {
    throw new Error('--status must be an integer HTTP status such as 500')
  }
  const warnings: string[] = []
  const same = existing.find((m) => m.name === name)
  if (same && !input.force) {
    throw new Error(
      `.mocks/${input.rpc.replaceAll(':', '.')}/${name}.json already exists. Pass --force to overwrite it, or --name to add a second ${state} mock`
    )
  }

  let data: unknown
  if (input.data !== undefined) data = input.data.value
  else if (input.body !== undefined) {
    try {
      data = JSON.parse(input.body)
    } catch (error) {
      throw new Error(
        `--body is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else if (state === 'error') {
    data = { message: 'Something went wrong' }
  } else if (state === 'empty' && isArrayOutput(surface, input.rpc)) {
    data = []
  } else {
    throw new Error(
      `Give the response with --body '<json>' or --from <file>. Only an error mock, or an empty mock of a function that returns a list, has a default body.`
    )
  }

  const others = existing.filter((m) => m.name !== name)
  const replacedDefault = same?.meta?.default === true
  const makeDefault =
    input.default === true ||
    others.length === 0 ||
    replacedDefault ||
    (state === 'healthy' && !others.some((m) => m.meta?.default))
  const clearDefault = makeDefault
    ? others.filter((m) => m.meta?.default).map((m) => m.name)
    : []
  if (makeDefault && state === 'error') {
    warnings.push(
      'the default mock is an error, so the screen opens in its failed state; add a healthy mock with --default'
    )
  }

  const meta: MockMeta = {
    label: input.label ?? LABELS[state],
    description: input.description ?? DESCRIPTIONS[state],
    state,
    ...(makeDefault ? { default: true } : {}),
  }
  if (state === 'error' || input.status !== undefined) {
    meta.status = input.status ?? 500
  }
  if (state === 'slow') meta.delayMs = 2000
  if (input.status !== undefined && state !== 'error') {
    warnings.push(`--status only matters for an error mock, state is ${state}`)
  }

  const fn = findFunction(surface, input.rpc)
  const mock: Mock = { name, hasData: true, data, meta, problems: [] }
  const report = diffMocks(
    [{ rpc: input.rpc, mocks: [...others, mock] }],
    surface
  ).rpcs[0]!
  const shape = {
    checked: known && !!fn,
    invalid: report.invalid
      .filter((entry) => entry.mock === name)
      .flatMap((entry) => entry.errors),
    changes: state === 'error' || !known ? [] : report.changes,
  }
  if (!known) {
    warnings.push(
      'the RPC belongs to an addon, so the body was not checked against its output'
    )
  }
  return {
    rpc: input.rpc,
    name,
    state,
    data,
    meta,
    clearDefault,
    replaces: !!same,
    hook: isQuery(input.rpc, fn?.readonly)
      ? 'usePikkuQueryStub'
      : 'usePikkuMutationStub',
    shape,
    warnings,
  }
}

export const stubHookCall = (
  hook: AddMockPlan['hook'],
  rpc: string,
  flag?: string
): string => `${hook}('${rpc}'${flag ? `, { featureFlag: '${flag}' }` : ''})`

/** Where the closing `}` of the object `defineFeatureFlags({ ... })` takes, or -1. */
const closingBrace = (source: string, open: number): number => {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const c = source[i]!
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) {
        if (source[i] === '\\') i++
      }
    } else if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
    } else if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2)
      if (i < 0) return -1
      i++
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

export const flagEntry = (flag: string, description: string): string =>
  `  ${flag}: {\n    description: '${description.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}',\n  },\n`

/** `source` with `flag` declared in its `defineFeatureFlags({ ... })`, or null when that call cannot be found. */
export const addFlagToSource = (
  source: string,
  flag: string,
  description: string
): string | null => {
  const call = /defineFeatureFlags\(\s*\{/.exec(source)
  if (!call) return null
  const open = call.index + call[0].length - 1
  const close = closingBrace(source, open)
  if (close < 0) return null
  const before = source.slice(open + 1, close)
  const lineStart = source.lastIndexOf('\n', close) + 1
  // the closing brace must be on a line of its own so the entry lands above it
  if (source.slice(lineStart, close).trim() !== '') return null
  const body = before.replace(/\s+$/, '')
  const needsComma = body.trim() !== '' && !body.endsWith(',')
  const head = source.slice(0, open + 1) + body + (needsComma ? ',' : '')
  return `${head}\n${flagEntry(flag, description)}${source.slice(lineStart)}`
}
