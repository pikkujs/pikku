import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const STUB_HOOKS = new Set(['usePikkuQueryStub', 'usePikkuMutationStub'])

export type StubProblemKind =
  | 'no-flag'
  | 'flag-not-literal'
  | 'undeclared-flag'
  | 'backend-supports'

export type StubCall = {
  file: string
  line: number
  hook: string
  rpc?: string
  flag?: string
  problem?: StubProblemKind
}

export type StubCheck = {
  ok: boolean
  calls: StubCall[]
  declaredFlags: string[]
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
    if (ts.isPropertyAssignment(prop) && propertyName(prop.name) === 'featureFlag') {
      const flag = literalText(prop.initializer)
      return flag ? { flag } : { problem: 'flag-not-literal' }
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'featureFlag') {
      return { problem: 'flag-not-literal' }
    }
    if (ts.isSpreadAssignment(prop)) return { problem: 'flag-not-literal' }
  }
  return { problem: 'no-flag' }
}

export const scanSource = (file: string, text: string): StubCall[] => {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const hooks = new Set(STUB_HOOKS)
  source.forEachChild(function importAliases(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const el of node.importClause.namedBindings.elements) {
        if (el.propertyName && STUB_HOOKS.has(el.propertyName.text)) {
          hooks.add(el.name.text)
        }
      }
    }
  })
  const calls: StubCall[] = []
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
        const { flag, problem } = readFlag(options)
        calls.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          hook: name,
          rpc: literalText(rpc),
          flag,
          problem,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return calls
}

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

export const checkStubs = (
  rootDir: string,
  roots: string[],
  declaredFlags: string[],
  mockFitsFunction: (rpc: string) => boolean = () => false
): StubCheck => {
  const declared = new Set(declaredFlags)
  const calls: StubCall[] = []
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      for (const call of scanSource(
        relative(rootDir, file),
        readFileSync(file, 'utf8')
      )) {
        if (call.rpc && mockFitsFunction(call.rpc)) {
          call.problem = 'backend-supports'
        } else if (!call.problem && call.flag && !declared.has(call.flag)) {
          call.problem = 'undeclared-flag'
        }
        calls.push(call)
      }
    }
  }
  return {
    ok: calls.every((call) => !call.problem),
    calls,
    declaredFlags: [...declared].sort(),
  }
}
