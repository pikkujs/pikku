import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { added, dim, removed } from '../../fabric/lib/output.js'
import { readSurface } from '../../utils/surface.js'
import { diffMocks } from '../mocks/diff.js'
import { readMocks } from '../mocks/read.js'
import {
  checkStubs,
  frontendRoots,
  type StubCheck,
  type StubProblemKind,
} from '../mocks/stub-scan.js'

const readDeclaredFlags = (pikkuDir: string): string[] => {
  try {
    return Object.keys(
      JSON.parse(
        readFileSync(join(pikkuDir, 'scopes', 'pikku-flags-meta.gen.json'), 'utf8')
      )
    )
  } catch {
    return []
  }
}

export const mocksCheck = pikkuSessionlessFunc<{ src?: string }, StubCheck>({
  description:
    'Block a release that would publish a stub hook without a declared featureFlag',
  func: async ({ config }, input) => {
    const roots = input?.src
      ? input.src.split(',').map((dir) => resolve(config.rootDir, dir.trim()))
      : frontendRoots(config.rootDir)
    const pikkuDir = resolve(config.rootDir, config.outDir)
    const surface = readSurface(pikkuDir)
    const fitting = new Set(
      diffMocks(await readMocks(config.rootDir), surface).rpcs
        .filter((report) => report.status === 'ok')
        .map((report) => report.rpc)
    )
    return checkStubs(
      config.rootDir,
      roots,
      readDeclaredFlags(pikkuDir),
      (rpc) => fitting.has(rpc)
    )
  },
})

const reason: Record<StubProblemKind, (flag?: string) => string> = {
  'no-flag': () => 'no featureFlag, so it cannot be published',
  'flag-not-literal': () =>
    'featureFlag must be a string literal so it can be checked',
  'undeclared-flag': (flag) => `the flag "${flag}" is not declared in the project`,
  'backend-supports': () => 'the backend already supports this',
}

export const renderMocksCheck = (_services: unknown, check: StubCheck): void => {
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
      console.log(`${added('✓')} ${where}  ${what}  ${dim(`flag ${call.flag}`)}`)
    }
  }
  const blocked = check.calls.filter((call) => call.problem).length
  console.log()
  console.log(
    dim(
      `${check.calls.length} stub call${check.calls.length === 1 ? '' : 's'} · ${blocked} blocked`
    )
  )
  if (!check.ok) process.exitCode = 1
}
