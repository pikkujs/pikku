import {
  compareContracts,
  contractFromSchema,
  inferContract,
  type ContractChange,
} from './contract.js'
import type { Mock, RpcMocks } from './read.js'
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

export type RpcStatus = 'ok' | 'added' | 'changed' | 'invalid'

export interface RpcReport {
  rpc: string
  status: RpcStatus
  mocks: number
  changes: ContractChange[]
  invalid: { mock: string; errors: string[] }[]
  problems: string[]
  warnings: string[]
}

export interface MocksDiff {
  rpcs: RpcReport[]
  unmocked: string[]
  ok: boolean
}

const isErrorMock = (mock: Mock): boolean => mock.meta?.state === 'error'

const findFunction = (surface: SurfaceView, rpc: string) =>
  Object.values(surface.functions)
    .filter((fn) => fn.key === rpc)
    .sort((a, b) => b.version - a.version)[0]

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
  if (!mocks.some(isErrorMock))
    warnings.push('no error mock, so the failed state cannot be tested')
  return warnings
}

export const diffMocks = (
  rpcMocks: RpcMocks[],
  surface: SurfaceView,
  options: { all?: boolean } = {}
): MocksDiff => {
  const rpcs = rpcMocks.map(({ rpc, mocks }): RpcReport => {
    const samples = mocks.filter((m) => m.hasData && !isErrorMock(m))
    const mockContract = inferContract(samples.map((m) => m.data))
    const problems = mocks.flatMap((m) =>
      m.problems.map((p) => (p.startsWith(m.name) ? p : `${m.name}: ${p}`))
    )
    const report: RpcReport = {
      rpc,
      status: 'ok',
      mocks: mocks.length,
      changes: [],
      invalid: [],
      problems,
      warnings: warningsFor(
        mocks,
        mockContract.$?.kinds.includes('array') ?? false
      ),
    }
    const fn = findFunction(surface, rpc)
    if (!fn) {
      report.status = 'added'
      return report
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
      report.changes = compareContracts(mockContract, expected)
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
  return { rpcs, unmocked, ok: rpcs.every((r) => r.status === 'ok') }
}
