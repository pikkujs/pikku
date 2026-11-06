import { join, relative } from 'node:path'
import { API, TypeFlags } from 'tsrs/sync'
import * as ast from 'tsrs/ast'
import { discoverRoutes, type DiscoveredRoute } from './http.ts'

// tsrs nodes are lazy views whose accessors are TypeScript-shaped; the package
// ships no per-kind node types worth the ceremony here.
type Node = any

const { SyntaxKind } = ast

export type DiscoveredFunction = {
  pikkuFuncId: string
  exportedName: string
  funcWrapper: string
  sessionless: boolean
  sourceFile: string
  isDirectFunction: boolean
  services: string[]
  inputs: string[]
  outputs: string[]
  description?: string
  title?: string
  tags?: string[]
  mcp?: boolean
  expose?: boolean
  auth?: boolean
}

const WRAPPER = /^(pikku[A-Za-z]*Func|pikkuWebhookReceive)$/
const VALID_VAR_NAME = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
const CHANNEL_CONNECTION = /ChannelConnection/i
const MCP_OUTPUT: Record<string, string> = {
  pikkuMCPResourceFunc: 'MCPResourceResponse',
  pikkuMCPToolFunc: 'MCPToolResponse',
  pikkuMCPPromptFunc: 'MCPPromptResponse',
}

/** tsutil.FuncIdToTypeName: split on non-alphanumerics and capitalise each part. */
const funcIdToTypeName = (id: string) =>
  id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')

/** tsutil.NullifyType */
const nullify = (name: string) =>
  ['void', 'undefined', 'unknown', 'any', 'null'].includes(name) ? '' : name

const isStringLike = (n: Node) =>
  n.kind === SyntaxKind.StringLiteral ||
  n.kind === SyntaxKind.NoSubstitutionTemplateLiteral

const literal = (n: Node): string | boolean | string[] | undefined => {
  if (!n) return undefined
  if (isStringLike(n)) return n.text
  if (n.kind === SyntaxKind.TrueKeyword) return true
  if (n.kind === SyntaxKind.FalseKeyword) return false
  if (n.kind === SyntaxKind.ArrayLiteralExpression) {
    const items = n.elements.map((e: Node) =>
      isStringLike(e) ? e.text : undefined
    )
    return items.every((i: unknown) => typeof i === 'string')
      ? items
      : undefined
  }
  return undefined
}

const propertyOf = (obj: Node, name: string): Node | undefined =>
  obj.properties.find(
    (p: Node) =>
      (p.kind === SyntaxKind.PropertyAssignment ||
        p.kind === SyntaxKind.ShorthandPropertyAssignment) &&
      p.name?.text === name
  )

const servicesOf = (fn: Node): string[] => {
  const first = fn?.parameters?.[0]
  if (!first || first.name.kind !== SyntaxKind.ObjectBindingPattern) return []
  return first.name.elements.map((e: Node) => (e.propertyName ?? e.name).text)
}

type Checker = any

const numberLiteral = (n: Node): number | undefined =>
  n?.kind === SyntaxKind.NumericLiteral ? Number(n.text) : undefined

/** group_functions.go's unwrapPromise: `Promise<T>` becomes `T`. */
const unwrapPromise = (checker: Checker, t: Node): Node =>
  checker.getAwaitedType(t) ?? t

/** util_types.go getNamesAndTypes: the names a function's input or output goes by. */
const namesFor = (
  checker: Checker,
  direction: 'Input' | 'Output',
  funcName: string,
  t: Node | undefined
): string[] => {
  if (!t || t.flags & (TypeFlags.Void | TypeFlags.Undefined | TypeFlags.Null))
    return []
  const isUnion =
    (t.flags & TypeFlags.Union) !== 0 &&
    (t.flags & TypeFlags.Intersection) === 0
  const members: Node[] = isUnion
    ? [...t.getTypes()].sort((a: Node, b: Node) => Number(a.id) - Number(b.id))
    : [t]
  const names = members
    .map((m) => nullify(checker.typeToString(m)))
    .filter(Boolean)
  if (
    names.length > 1 ||
    (names.length === 1 && !VALID_VAR_NAME.test(names[0]!))
  ) {
    return [funcIdToTypeName(funcName) + direction]
  }
  return names
}

const describe = (
  call: Node,
  exportedName: string,
  sourceFile: string,
  checker: Checker
): DiscoveredFunction => {
  const funcWrapper: string = call.expression.text
  const first = call.arguments[0]
  const direct = !first || first.kind !== SyntaxKind.ObjectLiteralExpression
  const config = direct ? undefined : first
  const fnProp = config && propertyOf(config, 'func')
  const fn = direct ? first : fnProp?.initializer

  const isMcp = funcWrapper in MCP_OUTPUT
  // An MCP tool's `name:` is the name it is published under, not the function id.
  const explicitName = isMcp
    ? undefined
    : literal(propertyOf(config ?? { properties: [] }, 'name')?.initializer)
  const name = typeof explicitName === 'string' ? explicitName : exportedName
  const version = numberLiteral(
    propertyOf(config ?? { properties: [] }, 'version')?.initializer
  )
  // group_functions.go: a `V<n>` suffix on the base name is dropped before `@v<n>` is added.
  const suffix = `V${version}`
  const base =
    version !== undefined &&
    name.endsWith(suffix) &&
    name.length > suffix.length
      ? name.slice(0, -suffix.length)
      : name
  const pikkuFuncId = version === undefined ? name : `${base}@v${version}`
  const capitalized = funcIdToTypeName(name)

  const isList = funcWrapper === 'pikkuListFunc'
  const isChannelConnection = CHANNEL_CONNECTION.test(funcWrapper)
  const generics: Node[] = (call.typeArguments ?? []).map((tn: Node) =>
    unwrapPromise(checker, checker.getTypeFromTypeNode(tn))
  )
  const handlerParam = (i: number): Node | undefined => fn?.parameters?.[i]

  let inputs: string[] = []
  if (config && propertyOf(config, 'input')) inputs = [`${capitalized}Input`]
  else if (isList && generics.length >= 1) inputs = [`${capitalized}Input`]
  else if (!isChannelConnection && !isList && generics.length >= 1)
    inputs = namesFor(checker, 'Input', name, generics[0])
  else if (handlerParam(1))
    inputs = namesFor(
      checker,
      'Input',
      pikkuFuncId,
      checker.getTypeAtLocation(handlerParam(1))
    )

  let outputs: string[] = []
  if (config && propertyOf(config, 'output')) outputs = [`${capitalized}Output`]
  else if (isList && generics.length >= 2) outputs = [`${capitalized}Output`]
  else if (!isList && generics.length >= 2)
    outputs = namesFor(checker, 'Output', name, generics[1])
  else if (fn) {
    const signature = checker.getSignatureFromDeclaration(fn)
    if (signature)
      outputs = namesFor(
        checker,
        'Output',
        pikkuFuncId,
        unwrapPromise(checker, checker.getReturnTypeOfSignature(signature))
      )
  }
  const mcpOutput = MCP_OUTPUT[funcWrapper]
  if (mcpOutput) outputs = [mcpOutput]

  const result: DiscoveredFunction = {
    pikkuFuncId,
    exportedName,
    funcWrapper,
    sessionless: funcWrapper !== 'pikkuFunc',
    sourceFile,
    isDirectFunction: direct,
    services: servicesOf(fn),
    inputs,
    outputs,
  }
  if (config) {
    for (const key of ['description', 'title'] as const) {
      const v = literal(propertyOf(config, key)?.initializer)
      if (typeof v === 'string') result[key] = v
    }
    for (const key of ['mcp', 'expose', 'auth'] as const) {
      const v = literal(propertyOf(config, key)?.initializer)
      if (typeof v === 'boolean' && (key === 'auth' || v)) result[key] = v
    }
    const tags = literal(propertyOf(config, 'tags')?.initializer)
    if (Array.isArray(tags)) result.tags = tags
  }
  if (funcWrapper === 'pikkuMCPToolFunc' && result.mcp === undefined)
    result.mcp = true
  return result
}

export type Discovery = {
  functions: DiscoveredFunction[]
  routes: DiscoveredRoute[]
  filesRead: number
  openMs: number
  walkMs: number
  routesMs: number
  rootFiles: number
}

/** Every `export const x = pikku…Func(...)` in the project's own source files. */
export const discoverFunctions = (projectDir: string): Discovery => {
  let t = performance.now()
  const api = new API({ cwd: projectDir })
  try {
    const snapshot = api.createSnapshot({
      openProjects: [join(projectDir, 'tsconfig.json')],
    })
    const project = snapshot.getProjects()[0]!
    const openMs = performance.now() - t
    t = performance.now()
    const root: string[] = project.parsedCommandLine?.fileNames ?? []
    const own = root.filter((f) => {
      const rel = relative(projectDir, f)
      return (
        rel.startsWith('src/') &&
        !rel.includes('node_modules') &&
        !/\.(test|spec)\./.test(rel) &&
        !rel.endsWith('.d.ts')
      )
    })
    const functions: DiscoveredFunction[] = []
    for (const file of own) {
      const sf = project.program.getSourceFile(file)
      if (!sf) continue
      for (const statement of sf.statements) {
        if (statement.kind !== SyntaxKind.VariableStatement) continue
        const exported = statement.modifiers?.some(
          (m: Node) => m.kind === SyntaxKind.ExportKeyword
        )
        if (!exported) continue
        for (const decl of statement.declarationList.declarations) {
          const init = decl.initializer
          if (
            init?.kind === SyntaxKind.CallExpression &&
            init.expression.kind === SyntaxKind.Identifier &&
            WRAPPER.test(init.expression.text)
          ) {
            functions.push(
              describe(init, decl.name.text, file, project.checker)
            )
          }
        }
      }
    }
    const idOf = new Map(
      functions.map((f) => [`${f.sourceFile}#${f.exportedName}`, f.pikkuFuncId])
    )
    t = performance.now()
    const routes = discoverRoutes(project, own, idOf)
    const routesMs = performance.now() - t
    return {
      functions,
      routes,
      routesMs,
      filesRead: own.length,
      openMs,
      walkMs: performance.now() - t,
      rootFiles: root.length,
    }
  } finally {
    api.close?.()
  }
}
