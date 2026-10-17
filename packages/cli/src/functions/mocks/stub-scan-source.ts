/**
 * The parts of the mocks stub scanner that read source with the TypeScript
 * compiler API. Kept apart from stub-scan.ts so commands that only list
 * frontend files or index calls never load the compiler.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'

import type {
  FrontendScan,
  PlainCall,
  StubCall,
  StubProblemKind,
} from './stub-scan.js'

const STUB_HOOKS = new Set(['usePikkuQueryStub', 'usePikkuMutationStub'])
const PLAIN_HOOKS = new Set(['usePikkuQuery', 'usePikkuMutation'])

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

export type ImportCheck = (specifier: string, name: string) => boolean

type ImportBinding = { specifier: string; name?: string }

const importBindings = (source: ts.SourceFile): Map<string, ImportBinding> => {
  const bindings = new Map<string, ImportBinding>()
  for (const node of source.statements) {
    if (
      !ts.isImportDeclaration(node) ||
      !node.importClause ||
      !ts.isStringLiteral(node.moduleSpecifier)
    ) {
      continue
    }
    const specifier = node.moduleSpecifier.text
    const { name, namedBindings } = node.importClause
    if (name) bindings.set(name.text, { specifier, name: 'default' })
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      bindings.set(namedBindings.name.text, { specifier })
    } else if (namedBindings) {
      for (const el of namedBindings.elements) {
        bindings.set(el.name.text, {
          specifier,
          name: (el.propertyName ?? el.name).text,
        })
      }
    }
  }
  return bindings
}

export const scanHooks = (
  file: string,
  text: string,
  fromClient?: ImportCheck
): HookCall[] => {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const bindings = importBindings(source)
  const hookOf = (
    callee: ts.Expression
  ): { name: string; hook: string; specifier?: string } | undefined => {
    if (ts.isIdentifier(callee)) {
      const binding = bindings.get(callee.text)
      if (!binding) return { name: callee.text, hook: callee.text }
      return binding.name
        ? {
            name: callee.text,
            hook: binding.name,
            specifier: binding.specifier,
          }
        : undefined
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text
      const binding = ts.isIdentifier(callee.expression)
        ? bindings.get(callee.expression.text)
        : undefined
      return binding && !binding.name
        ? { name, hook: name, specifier: binding.specifier }
        : { name, hook: name }
    }
    return undefined
  }
  const calls: HookCall[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const found = hookOf(node.expression)
      const stub = found && STUB_HOOKS.has(found.hook)
      if (
        found &&
        (stub || PLAIN_HOOKS.has(found.hook)) &&
        (!found.specifier ||
          !fromClient ||
          fromClient(found.specifier, found.hook))
      ) {
        const [rpc, options] = node.arguments
        const line =
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        if (stub) {
          const { flag, problem } = readFlag(options)
          calls.push({
            file,
            line,
            hook: found.name,
            rpc: literalText(rpc),
            flag,
            problem,
            stub: true,
          })
        } else {
          calls.push({
            file,
            line,
            hook: found.name,
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

const withoutExtension = (file: string): string =>
  file.replace(/(\.d)?\.[cm]?[jt]sx?$/, '')

const realPath = (file: string): string => {
  try {
    return realpathSync(file)
  } catch {
    return resolve(file)
  }
}

const BUNDLER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
}

const reexported = (
  clause: ts.NamedExports,
  name: string
): string | undefined => {
  const el = clause.elements.find((e) => e.name.text === name)
  return el && (el.propertyName ?? el.name).text
}

export const clientImports = (client: string) => {
  const target = withoutExtension(realPath(client))
  const configs = new Map<string, ts.CompilerOptions>()
  const optionsFor = (dir: string): ts.CompilerOptions => {
    const configPath = ts.findConfigFile(dir, ts.sys.fileExists)
    if (!configPath) return {}
    let options = configs.get(configPath)
    if (!options) {
      options =
        ts.getParsedCommandLineOfConfigFile(
          configPath,
          {},
          { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
        )?.options ?? {}
      configs.set(configPath, options)
    }
    return options
  }
  const lookup = (
    specifier: string,
    from: string,
    options: ts.CompilerOptions
  ): string | undefined =>
    ts.resolveModuleName(specifier, from, options, ts.sys).resolvedModule
      ?.resolvedFileName
  const resolved = new Map<string, string | undefined>()
  const resolveFrom = (from: string, specifier: string) => {
    const key = `${dirname(from)}\0${specifier}`
    if (!resolved.has(key)) {
      const options = optionsFor(dirname(from))
      const found =
        lookup(specifier, from, options) ??
        lookup(specifier, from, { ...options, ...BUNDLER_OPTIONS })
      resolved.set(key, found && realPath(found))
    }
    return resolved.get(key)
  }
  const reaches = new Map<string, boolean>()
  const reachesClient = (file: string, name: string): boolean => {
    if (withoutExtension(file) === target) return true
    const key = `${file}\0${name}`
    if (reaches.has(key)) return reaches.get(key)!
    reaches.set(key, false)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return false
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest)
    const found = source.statements.some((node) => {
      if (
        !ts.isExportDeclaration(node) ||
        !node.moduleSpecifier ||
        !ts.isStringLiteral(node.moduleSpecifier)
      ) {
        return false
      }
      const original = !node.exportClause
        ? name
        : ts.isNamedExports(node.exportClause)
          ? reexported(node.exportClause, name)
          : undefined
      if (!original) return false
      const next = resolveFrom(file, node.moduleSpecifier.text)
      return next === undefined || reachesClient(next, original)
    })
    reaches.set(key, found)
    return found
  }
  return (from: string): ImportCheck =>
    (specifier, name) => {
      const file = resolveFrom(from, specifier)
      return file === undefined || reachesClient(file, name)
    }
}

export const scanFrontend = (
  rootDir: string,
  files: string[],
  client?: string
): FrontendScan => {
  const scan: FrontendScan = { stubCalls: [], plainCalls: [] }
  const imports = client ? clientImports(resolve(rootDir, client)) : undefined
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!text.includes('usePikku')) continue
    for (const call of scanHooks(
      relative(rootDir, file),
      text,
      imports?.(file)
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
  return scan
}
