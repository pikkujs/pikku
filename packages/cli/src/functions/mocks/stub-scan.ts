import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

import type { RpcStatus } from './diff.js'

const STUB_HOOKS = new Set(['usePikkuQueryStub', 'usePikkuMutationStub'])
const PLAIN_HOOKS = new Set(['usePikkuQuery', 'usePikkuMutation'])

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

const literalText = (node: ts.Node | undefined): string | undefined =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined

const propertyName = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined

const readFlag = (
  options: ts.Expression | undefined
): { flag?: string; problem?: StubProblemKind } => {
  if (!options || !ts.isObjectLiteralExpression(options)) {
    return { problem: options ? 'flag-not-literal' : 'no-flag' }
  }
  for (const prop of options.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      propertyName(prop.name) === 'featureFlag'
    ) {
      const flag = literalText(prop.initializer)
      return flag ? { flag } : { problem: 'flag-not-literal' }
    }
    if (
      ts.isShorthandPropertyAssignment(prop) &&
      prop.name.text === 'featureFlag'
    ) {
      return { problem: 'flag-not-literal' }
    }
    if (ts.isSpreadAssignment(prop)) return { problem: 'flag-not-literal' }
  }
  return { problem: 'no-flag' }
}

type HookCall = (StubCall & { stub: true }) | (PlainCall & { stub: false })

export const scanHooks = (file: string, text: string): HookCall[] => {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const hooks = new Map<string, boolean>()
  for (const name of STUB_HOOKS) hooks.set(name, true)
  for (const name of PLAIN_HOOKS) hooks.set(name, false)
  source.forEachChild(function importAliases(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const el of node.importClause.namedBindings.elements) {
        const original = el.propertyName?.text
        if (original && hooks.has(original)) {
          hooks.set(el.name.text, hooks.get(original)!)
        }
      }
    }
  })
  const calls: HookCall[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined
      if (name && hooks.has(name)) {
        const [rpc, options] = node.arguments
        const line =
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        if (hooks.get(name)) {
          const { flag, problem } = readFlag(options)
          calls.push({
            file,
            line,
            hook: name,
            rpc: literalText(rpc),
            flag,
            problem,
            stub: true,
          })
        } else {
          calls.push({
            file,
            line,
            hook: name,
            rpc: literalText(rpc),
            stub: false,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return calls
}

export const scanSource = (file: string, text: string): StubCall[] =>
  scanHooks(file, text).flatMap((call) => {
    if (!call.stub) return []
    const { stub: _stub, ...rest } = call
    return [rest]
  })

const SKIP_DIRS = new Set(['node_modules', 'dist', '.pikku', '.output', '.git'])

const sourceFiles = (dir: string): string[] => {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full)
      } else if (
        /\.[jt]sx?$/.test(entry) &&
        !/\.(gen|d)\.[jt]s$/.test(entry) &&
        !/\.test\.[jt]sx?$/.test(entry)
      ) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
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

export const scanFrontend = (
  rootDir: string,
  roots: string[]
): FrontendScan => {
  const scan: FrontendScan = { stubCalls: [], plainCalls: [] }
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      for (const call of scanHooks(
        relative(rootDir, file),
        readFileSync(file, 'utf8')
      )) {
        if (call.stub) {
          const { stub: _stub, ...rest } = call
          scan.stubCalls.push(rest)
        } else {
          const { stub: _stub, ...rest } = call
          scan.plainCalls.push(rest)
        }
      }
    }
  }
  return scan
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
