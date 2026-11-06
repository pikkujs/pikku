import { SymbolFlags } from 'tsrs/sync'
import * as ast from 'tsrs/ast'

type Node = any
const { SyntaxKind } = ast

export type DiscoveredRoute = {
  method: string
  route: string
  /** Undefined when `func` is not a reference to a declared function (an inline function, an addon's). */
  pikkuFuncId?: string
  auth?: boolean
  params: string[]
  tags?: string[]
  sourceFile: string
}

const isStringLike = (n: Node) =>
  n?.kind === SyntaxKind.StringLiteral ||
  n?.kind === SyntaxKind.NoSubstitutionTemplateLiteral

const prop = (obj: Node, name: string): Node | undefined =>
  obj?.properties?.find(
    (p: Node) =>
      (p.kind === SyntaxKind.PropertyAssignment ||
        p.kind === SyntaxKind.ShorthandPropertyAssignment) &&
      p.name?.text === name
  )

const text = (obj: Node, name: string): string | undefined => {
  const init = prop(obj, name)?.initializer
  return isStringLike(init) ? init.text : undefined
}

const bool = (obj: Node, name: string): boolean | undefined => {
  const init = prop(obj, name)?.initializer
  return init?.kind === SyntaxKind.TrueKeyword
    ? true
    : init?.kind === SyntaxKind.FalseKeyword
      ? false
      : undefined
}

const strings = (obj: Node, name: string): string[] | undefined => {
  const init = prop(obj, name)?.initializer
  if (init?.kind !== SyntaxKind.ArrayLiteralExpression) return undefined
  const items = init.elements.map((e: Node) =>
    isStringLike(e) ? e.text : undefined
  )
  return items.every((i: unknown) => typeof i === 'string') ? items : undefined
}

/** `/runs/:runId/steps/:stepId` → ['runId', 'stepId'] */
const paramsOf = (route: string): string[] =>
  [...route.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!)

/**
 * The function a route's `func:` names, found through the checker so an import
 * (possibly renamed or re-exported) resolves to the declaration. `idOf` maps a
 * declaration's `file#name` to the id the function discovery gave it.
 */
const resolveFunc = (
  project: Node,
  funcExpr: Node,
  idOf: Map<string, string>
): string | undefined => {
  if (funcExpr?.kind !== SyntaxKind.Identifier) return undefined
  const checker = project.checker
  let symbol = checker.getSymbolAtLocation(funcExpr)
  if (symbol && symbol.flags & SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol)
  const declaration = symbol?.valueDeclaration?.resolve(project)
  if (declaration?.kind !== SyntaxKind.VariableDeclaration) return undefined
  const file = declaration.getSourceFile().fileName
  return idOf.get(`${file}#${declaration.name.text}`)
}

type Inherited = { basePath: string; auth?: boolean; tags: string[] }

const isObject = (n: Node) => n?.kind === SyntaxKind.ObjectLiteralExpression

/** The `defineHTTPRoutes({...})` object a reference points at, found through the checker. */
const groupBehind = (project: Node, ref: Node): Node | undefined => {
  if (isObject(ref)) return ref
  if (ref?.kind !== SyntaxKind.Identifier) return undefined
  const checker = project.checker
  let symbol = checker.getSymbolAtLocation(ref)
  if (symbol && symbol.flags & SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol)
  const declaration = symbol?.valueDeclaration?.resolve(project)
  const init =
    declaration?.kind === SyntaxKind.VariableDeclaration
      ? declaration.initializer
      : undefined
  return init?.kind === SyntaxKind.CallExpression && isObject(init.arguments[0])
    ? init.arguments[0]
    : undefined
}

const routeFrom = (
  project: Node,
  entry: Node,
  inherited: Inherited,
  idOf: Map<string, string>,
  sourceFile: string
): DiscoveredRoute | undefined => {
  const method = text(entry, 'method')
  const route = text(entry, 'route')
  if (!method || route === undefined) return undefined
  const full = inherited.basePath + route
  const result: DiscoveredRoute = {
    method,
    route: full,
    pikkuFuncId: resolveFunc(project, prop(entry, 'func')?.initializer, idOf),
    params: paramsOf(full),
    sourceFile,
  }
  const auth = bool(entry, 'auth') ?? inherited.auth
  if (auth !== undefined) result.auth = auth
  const tags = [...inherited.tags, ...(strings(entry, 'tags') ?? [])]
  if (tags.length) result.tags = tags
  return result
}

/** A group's own `basePath`, `auth` and `tags` on top of what it inherits. */
const narrow = (group: Node, parent: Inherited): Inherited => ({
  basePath: parent.basePath + (text(group, 'basePath') ?? ''),
  auth: bool(group, 'auth') ?? parent.auth,
  tags: [...parent.tags, ...(strings(group, 'tags') ?? [])],
})

const walkTable = (
  project: Node,
  table: Node,
  inherited: Inherited,
  idOf: Map<string, string>,
  sourceFile: string,
  out: DiscoveredRoute[],
  seen: Set<Node>
) => {
  for (const entry of table.properties) {
    if (entry.kind !== SyntaxKind.PropertyAssignment) continue
    const value = entry.initializer
    if (isObject(value) && text(value, 'method') !== undefined) {
      const r = routeFrom(project, value, inherited, idOf, sourceFile)
      if (r) out.push(r)
      continue
    }
    const group = groupBehind(project, value)
    if (!group || seen.has(group)) continue
    seen.add(group)
    const routes = prop(group, 'routes')?.initializer
    if (isObject(routes))
      walkTable(
        project,
        routes,
        narrow(group, inherited),
        idOf,
        group.getSourceFile().fileName,
        out,
        seen
      )
    seen.delete(group)
  }
}

/** `wireHTTP({...})` and `wireHTTPRoutes({ routes })`, following `defineHTTPRoutes` groups through the checker. */
export const discoverRoutes = (
  project: Node,
  files: string[],
  idOf: Map<string, string>
): DiscoveredRoute[] => {
  const routes: DiscoveredRoute[] = []
  const root: Inherited = { basePath: '', tags: [] }
  for (const file of files) {
    const sf = project.program.getSourceFile(file)
    if (!sf) continue
    for (const statement of sf.statements) {
      const call =
        statement.kind === SyntaxKind.ExpressionStatement
          ? statement.expression
          : undefined
      if (
        call?.kind !== SyntaxKind.CallExpression ||
        call.expression.kind !== SyntaxKind.Identifier
      )
        continue
      const arg = call.arguments[0]
      if (!isObject(arg)) continue
      if (call.expression.text === 'wireHTTP') {
        const r = routeFrom(project, arg, root, idOf, file)
        if (r) routes.push(r)
      } else if (call.expression.text === 'wireHTTPRoutes') {
        const table = prop(arg, 'routes')?.initializer
        if (isObject(table))
          walkTable(
            project,
            table,
            narrow(arg, root),
            idOf,
            file,
            routes,
            new Set()
          )
      }
    }
  }
  return routes
}
