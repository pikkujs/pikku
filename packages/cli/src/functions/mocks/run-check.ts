import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readSurface } from '../../utils/surface.js'
import { diffMocks } from './diff.js'
import { readMocks } from './read.js'
import {
  callIndex,
  checkStubs,
  frontendRoots,
  scanFrontend,
  type StubCheck,
  type StubProblemKind,
} from './stub-scan.js'

export const PROBLEM_REASON: Record<
  StubProblemKind,
  (flag?: string) => string
> = {
  'no-flag': () => 'no featureFlag, so it cannot be published',
  'flag-not-literal': () =>
    'featureFlag must be a string literal so it can be checked',
  'undeclared-flag': (flag) =>
    `the flag "${flag}" is not declared in the project`,
  'backend-supports': () => 'the backend already supports this',
  'mock-invalid': () =>
    'its mock is invalid for the function, fix the mock (pikku mocks diff shows why)',
  'no-mock': () => 'there is no .mocks/ directory for this RPC',
}

const readDeclaredFlags = (pikkuDir: string): string[] => {
  try {
    return Object.keys(
      JSON.parse(
        readFileSync(
          join(pikkuDir, 'scopes', 'pikku-flags-meta.gen.json'),
          'utf8'
        )
      )
    )
  } catch {
    return []
  }
}

export interface MocksCheckOptions {
  rootDir: string
  outDir: string
  src?: string
  strict?: boolean
}

/** The stub release check, usable by `pikku mocks check` and `pikku validate` alike. */
export const runMocksCheck = async (
  options: MocksCheckOptions
): Promise<StubCheck> => {
  const { rootDir, outDir } = options
  const roots = options.src
    ? options.src.split(',').map((dir) => resolve(rootDir, dir.trim()))
    : frontendRoots(rootDir)
  const pikkuDir = resolve(rootDir, outDir)
  const surface = readSurface(pikkuDir)
  const rpcMocks = await readMocks(rootDir)
  const scan = scanFrontend(rootDir, roots)
  const diff = diffMocks(rpcMocks, surface, { calls: callIndex(scan) })
  const status = new Map(diff.rpcs.map((report) => [report.rpc, report.status]))
  const keys = new Set(Object.values(surface.functions).map((fn) => fn.key))
  return checkStubs(
    scan,
    readDeclaredFlags(pikkuDir),
    {
      hasFunction: (rpc) => keys.has(rpc),
      status: (rpc) => status.get(rpc),
      mocked: new Set(rpcMocks.map((entry) => entry.rpc)),
      dead: diff.rpcs.filter((r) => r.status === 'removed').map((r) => r.rpc),
      unused: diff.rpcs.filter((r) => r.unused).map((r) => r.rpc),
    },
    { strict: options.strict === true }
  )
}

export const hasBuiltOutput = (rootDir: string, outDir: string): boolean =>
  existsSync(resolve(rootDir, outDir))
