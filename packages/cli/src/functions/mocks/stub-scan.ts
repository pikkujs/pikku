import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { RpcStatus } from './diff.js'

export type StubProblemKind =
  | 'no-flag'
  | 'flag-not-literal'
  | 'undeclared-flag'
  | 'backend-supports'
  | 'mock-invalid'
  | 'no-mock'

export type StubCall = {
  file: string
  line: number
  hook: string
  rpc?: string
  flag?: string
  problem?: StubProblemKind
}

export type PlainCall = {
  file: string
  line: number
  hook: string
  rpc?: string
}

export type FrontendScan = {
  stubCalls: StubCall[]
  plainCalls: PlainCall[]
}

export type CallIndex = {
  plain: Set<string>
  stub: Set<string>
  unresolved: number
}

export type RpcFacts = {
  hasFunction?: (rpc: string) => boolean
  status?: (rpc: string) => RpcStatus | undefined
  mocked?: Set<string>
  dead?: string[]
  unused?: string[]
}

export type StubCheck = {
  ok: boolean
  calls: StubCall[]
  declaredFlags: string[]
  missing: PlainCall[]
  orphanFlags: string[]
  dead: string[]
  unused: string[]
  unresolved: number
  strict: boolean
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.pikku', '.output', '.git'])

const isSourceFile = (path: string): boolean =>
  /\.[jt]sx?$/.test(path) &&
  !/\.(gen|d)\.[jt]s$/.test(path) &&
  !/\.test\.[jt]sx?$/.test(path)

const sourceFiles = (dir: string): string[] => {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full)
      } else if (isSourceFile(entry)) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
}

const git = (dir: string, args: string[]): string[] | undefined => {
  try {
    return execFileSync('git', ['ls-files', '-z', ...args], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1024 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean)
  } catch {
    return undefined
  }
}

const gitFiles = (dir: string): string[] | undefined => {
  const listed = git(dir, ['--cached', '--others', '--exclude-standard'])
  if (!listed) return undefined
  const submodules = (git(dir, ['--stage']) ?? []).flatMap((entry) =>
    entry.startsWith('160000 ') ? [join(dir, entry.split('\t')[1]!)] : []
  )
  return [
    ...listed.filter(isSourceFile).map((rel) => join(dir, rel)),
    ...submodules.flatMap((sub) =>
      existsSync(join(sub, '.git')) ? (gitFiles(sub) ?? []) : []
    ),
  ]
}

export const frontendRoots = (rootDir: string): string[] => {
  try {
    return readdirSync(join(rootDir, 'apps'))
      .map((app) => join(rootDir, 'apps', app, 'src'))
      .filter((dir) => {
        try {
          return statSync(dir).isDirectory()
        } catch {
          return false
        }
      })
  } catch {
    return []
  }
}

export const frontendFiles = (rootDir: string, src?: string): string[] => {
  if (src) {
    return src
      .split(',')
      .flatMap((dir) => sourceFiles(resolve(rootDir, dir.trim())))
  }
  return (
    gitFiles(rootDir) ??
    frontendRoots(rootDir).flatMap((dir) => sourceFiles(dir))
  )
}

export const callIndex = (scan: FrontendScan): CallIndex => {
  const index: CallIndex = { plain: new Set(), stub: new Set(), unresolved: 0 }
  for (const call of scan.plainCalls) {
    if (call.rpc) index.plain.add(call.rpc)
    else index.unresolved++
  }
  for (const call of scan.stubCalls) {
    if (call.rpc) index.stub.add(call.rpc)
    else index.unresolved++
  }
  return index
}

export const checkStubs = (
  scan: FrontendScan,
  declaredFlags: string[],
  facts: RpcFacts = {},
  options: { strict?: boolean } = {}
): StubCheck => {
  const declared = new Set(declaredFlags)
  const calls = scan.stubCalls.map((original): StubCall => {
    const call = { ...original }
    const status = call.rpc ? facts.status?.(call.rpc) : undefined
    if (call.rpc && status === 'ok') {
      call.problem = 'backend-supports'
    } else if (call.rpc && status === 'invalid') {
      call.problem = 'mock-invalid'
    } else if (call.rpc && facts.mocked && !facts.mocked.has(call.rpc)) {
      call.problem = 'no-mock'
    } else if (!call.problem && call.flag && !declared.has(call.flag)) {
      call.problem = 'undeclared-flag'
    }
    return call
  })
  const stubbed = new Set(calls.flatMap((call) => (call.rpc ? [call.rpc] : [])))
  const missing = facts.hasFunction
    ? scan.plainCalls.filter(
        (call) =>
          call.rpc && !facts.hasFunction!(call.rpc) && !stubbed.has(call.rpc)
      )
    : []
  const unresolved = callIndex(scan).unresolved
  const flagsKnown = calls.every((call) => call.problem !== 'flag-not-literal')
  const used = new Set(calls.flatMap((call) => (call.flag ? [call.flag] : [])))
  const orphanFlags =
    flagsKnown && unresolved === 0
      ? [...declared].filter((flag) => !used.has(flag)).sort()
      : []
  const dead = facts.dead ?? []
  const unused = facts.unused ?? []
  const strict = options.strict === true
  return {
    ok:
      calls.every((call) => !call.problem) &&
      missing.length === 0 &&
      (!strict || (dead.length === 0 && unused.length === 0)),
    calls,
    declaredFlags: [...declared].sort(),
    missing,
    orphanFlags,
    dead,
    unused,
    unresolved,
    strict,
  }
}
