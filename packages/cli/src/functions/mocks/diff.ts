import {
  compareContracts,
  type Contract,
  contractFromSchema,
  inferContract,
  type ContractChange,
} from './contract.js'
import { driftOf, type Drift, type MocksLock } from './lock.js'
import type { Mock, RpcMocks } from './read.js'
import type { CallIndex } from './stub-scan.js'
import { validateAgainstSchema } from './validate.js'

export interface SurfaceView {
  functions: Record<
    string,
    {
      key: string
      version: number
      outputSchemaName: string | null
      expose?: boolean
      platform?: boolean
    }
  >
  schemas: Record<string, unknown>
}

export type RpcStatus = 'ok' | 'added' | 'changed' | 'invalid' | 'removed'

export interface RpcReport {
  rpc: string
  status: RpcStatus
  unused?: boolean
  mocks: number
  changes: ContractChange[]
  drift: Drift[]
  unsynced?: boolean
  invalid: { mock: string; errors: string[] }[]
  problems: string[]
  warnings: string[]
}

export interface MocksDiff {
  rpcs: RpcReport[]
  lock?: 'missing' | 'present'
  lockOnly: string[]
  unmocked: string[]
  unresolved: number
  ok: boolean
}

const isErrorMock = (mock: Mock): boolean => mock.meta?.state === 'error'

export const findFunction = (surface: SurfaceView, rpc: string) =>
  Object.values(surface.functions)
    .filter((fn) => fn.key === rpc)
    .sort((a, b) => b.version - a.version)[0]

/** What the function returns, as a contract; undefined when there is no function or its schema is missing. */
export const functionContract = (
  surface: SurfaceView,
  rpc: string
): Contract | undefined => {
  const fn = findFunction(surface, rpc)
  if (!fn) return undefined
  if (!fn.outputSchemaName) return { $: { kinds: ['null'], optional: false } }
  const schema = surface.schemas[fn.outputSchemaName]
  return schema === undefined ? undefined : contractFromSchema(schema)
}

export const mockContract = (mocks: Mock[]): Contract =>
  inferContract(
    mocks.filter((m) => m.hasData && !isErrorMock(m)).map((m) => m.data)
  )

const warningsFor = (mocks: Mock[], rootIsArray: boolean): string[] => {
  const warnings: string[] = []
  for (const mock of mocks) {
    if (mock.hasData && !mock.meta) {
      warnings.push(`${mock.name}.json has no ${mock.name}.meta.json`)
    }
    if (isErrorMock(mock) && mock.meta?.status === undefined) {
      warnings.push(`${mock.name} is an error mock with no status`)
    }
  }
  const defaults = mocks.filter((m) => m.meta?.default).map((m) => m.name)
  if (defaults.length === 0) warnings.push('no mock is marked default')
  if (defaults.length > 1)
    warnings.push(`several mocks are marked default: ${defaults.join(', ')}`)
  if (rootIsArray && !mocks.some((m) => m.meta?.state === 'empty')) {
    warnings.push('no empty mock, so the empty state cannot be tested')
  }
  if (mocks.length && mocks.every(isErrorMock)) {
    warnings.push('only error mocks, add a healthy mock and mark it default')
  }
  if (!mocks.some(isErrorMock))
    warnings.push('no error mock, so the failed state cannot be tested')
  return warnings
}

export const diffMocks = (
  rpcMocks: RpcMocks[],
  surface: SurfaceView,
  options: { all?: boolean; calls?: CallIndex; lock?: MocksLock | null } = {}
): MocksDiff => {
  const rpcs = rpcMocks.map(({ rpc, mocks }): RpcReport => {
    const samples = mocks.filter((m) => m.hasData && !isErrorMock(m))
    const contract = inferContract(samples.map((m) => m.data))
    const problems = mocks.flatMap((m) =>
      m.problems.map((p) => (p.startsWith(m.name) ? p : `${m.name}: ${p}`))
    )
    const report: RpcReport = {
      rpc,
      status: 'ok',
      mocks: mocks.length,
      changes: [],
      drift: [],
      invalid: [],
      problems,
      warnings: warningsFor(
        mocks,
        contract.$?.kinds.includes('array') ?? false
      ),
    }
    const calls = options.calls
    const called =
      calls && calls.unresolved === 0
        ? calls.plain.has(rpc) || calls.stub.has(rpc)
        : undefined
    const dir = `.mocks/${rpc.replaceAll(':', '.')}`
    const fn = findFunction(surface, rpc)
    const locked = options.lock?.rpcs[rpc]
    if (options.lock) {
      if (locked) report.drift = driftOf(locked.mock, contract)
      else report.unsynced = true
      if (locked?.function && !fn) {
        report.warnings.push(
          'the function was removed since the last sync of the lock'
        )
      }
    }
    if (!fn) {
      if (called === false) {
        report.status = 'removed'
        report.warnings.push(`unused, delete ${dir}`)
      } else {
        report.status = 'added'
      }
      return report
    }
    if (called === false) {
      report.unused = true
      report.warnings.push(
        `unused, nothing in the frontend calls ${rpc}; delete ${dir} if it is no longer needed`
      )
    }
    if (!fn.expose) {
      report.warnings.push(
        'the function is not exposed, so the frontend cannot call it'
      )
    }
    const schema = fn.outputSchemaName
      ? surface.schemas[fn.outputSchemaName]
      : undefined
    if (fn.outputSchemaName && schema === undefined) {
      report.warnings.push(
        `schema ${fn.outputSchemaName} not found, run pikku all first`
      )
    } else {
      const expected =
        schema === undefined
          ? { $: { kinds: ['null' as const], optional: false } }
          : contractFromSchema(schema)
      report.changes = compareContracts(contract, expected)
      if (locked?.function && driftOf(locked.function, expected).length) {
        report.warnings.push(
          "the function's output changed since the last sync, run pikku mocks sync once the mocks follow"
        )
      }
      for (const mock of samples) {
        const errors =
          schema === undefined
            ? mock.data === null
              ? []
              : ['$ is not null, the function returns nothing']
            : validateAgainstSchema(mock.data, schema)
        if (errors.length) report.invalid.push({ mock: mock.name, errors })
      }
    }
    if (report.problems.length) report.status = 'invalid'
    else if (report.changes.length) report.status = 'changed'
    else if (report.invalid.length) report.status = 'invalid'
    else if (report.drift.length || report.unsynced) report.status = 'changed'
    return report
  })
  const known = new Set(rpcMocks.map((r) => r.rpc))
  const unmocked = options.all
    ? [
        ...new Set(
          Object.values(surface.functions)
            .filter((fn) => fn.expose && !fn.platform)
            .map((fn) => fn.key)
        ),
      ]
        .filter((key) => !known.has(key))
        .sort()
    : []
  const lockOnly = options.lock
    ? Object.keys(options.lock.rpcs)
        .filter((rpc) => !known.has(rpc))
        .sort()
    : []
  return {
    rpcs,
    lock:
      options.lock === undefined
        ? undefined
        : options.lock === null
          ? 'missing'
          : 'present',
    lockOnly,
    unmocked,
    unresolved: options.calls?.unresolved ?? 0,
    ok: rpcs.every((r) => r.status === 'ok' || r.status === 'removed'),
  }
}
