import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import { readSurface } from '../../utils/surface.js'
import { diffMocks } from '../mocks/diff.js'
import { readMocks } from '../mocks/read.js'
import {
  callIndex,
  checkStubs,
  frontendRoots,
  scanFrontend,
  type StubCheck,
  type StubProblemKind,
} from '../mocks/stub-scan.js'

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

export const mocksCheck = pikkuSessionlessFunc<
  { src?: string; strict?: boolean },
  StubCheck
>({
  description:
    'Block a release that would publish a stub hook without a declared featureFlag',
  func: async ({ config }, input) => {
    const roots = input?.src
      ? input.src.split(',').map((dir) => resolve(config.rootDir, dir.trim()))
      : frontendRoots(config.rootDir)
    const pikkuDir = resolve(config.rootDir, config.outDir)
    const surface = readSurface(pikkuDir)
    const rpcMocks = await readMocks(config.rootDir)
    const scan = scanFrontend(config.rootDir, roots)
    const diff = diffMocks(rpcMocks, surface, { calls: callIndex(scan) })
    const status = new Map(
      diff.rpcs.map((report) => [report.rpc, report.status])
    )
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
      { strict: input?.strict === true }
    )
  },
})

const reason: Record<StubProblemKind, (flag?: string) => string> = {
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

export const renderMocksCheck = (
  _services: unknown,
  check: StubCheck
): void => {
  for (const call of check.calls) {
    const where = `${call.file}:${call.line}`
    const what = `${call.hook}(${call.rpc ? `'${call.rpc}'` : '…'})`
    if (call.problem === 'backend-supports') {
      console.log(
        `${removed('✗')} ${where}  ${what}: ${dim('the backend already supports this; use ' + call.hook.replace(/Stub$/, ''))}`
      )
    } else if (call.problem) {
      console.log(
        `${removed('✗')} ${where}  ${what}  ${dim(reason[call.problem](call.flag))}`
      )
    } else {
      console.log(
        `${added('✓')} ${where}  ${what}  ${dim(`flag ${call.flag}`)}`
      )
    }
  }
  for (const call of check.missing) {
    console.log(
      `${removed('✗')} ${call.file}:${call.line}  ${call.hook}('${call.rpc}')  ${dim('no function: implement it or use usePikkuQueryStub')}`
    )
  }
  for (const rpc of check.dead) {
    console.log(
      `${check.strict ? removed('✗') : changed('⚠')} ${dim(`${rpc}: unused, delete .mocks/${rpc.replaceAll(':', '.')}`)}`
    )
  }
  for (const rpc of check.unused) {
    console.log(
      `${check.strict ? removed('✗') : changed('⚠')} ${dim(`${rpc}: its mock is not called by anything in the frontend`)}`
    )
  }
  for (const flag of check.orphanFlags) {
    console.log(
      `${changed('⚠')} ${dim(`flag "${flag}" is declared but no stub uses it; other code may still use it`)}`
    )
  }
  if (check.unresolved) {
    console.log(
      dim(
        `${check.unresolved} hook call${check.unresolved === 1 ? '' : 's'} with a name that is not a string literal, so no mock is reported unused`
      )
    )
  }
  const blocked =
    check.calls.filter((call) => call.problem).length + check.missing.length
  console.log()
  console.log(
    dim(
      `${check.calls.length} stub call${check.calls.length === 1 ? '' : 's'} · ${blocked} blocked`
    )
  )
  if (!check.ok) process.exitCode = 1
}
