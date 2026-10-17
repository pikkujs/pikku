import * as ts from 'typescript'

const MAX_DEPTH = 8

/** The helpers that define or register middleware. */
export const MIDDLEWARE_HELPERS: ReadonlySet<string> = new Set([
  'pikkuMiddleware',
  'pikkuMiddlewareFactory',
  'addTagMiddleware',
  'addGlobalMiddleware',
  'addHTTPMiddleware',
  'pikkuChannelMiddleware',
  'pikkuChannelMiddlewareFactory',
  'pikkuAgentMiddleware',
  'addChannelMiddleware',
])

/** The helpers that define permissions. */
export const PERMISSION_HELPERS: ReadonlySet<string> = new Set([
  'pikkuPermission',
  'pikkuAuth',
  'pikkuPermissionFactory',
])

type NameMatcher = ReadonlySet<string> | ((name: string) => boolean)

const matcher = (known: NameMatcher) =>
  typeof known === 'function' ? known : (name: string) => known.has(name)

const namesCache = new WeakMap<
  ts.TypeChecker,
  WeakMap<ts.Expression, readonly string[]>
>()

const unwrap = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

export const isNamespaceReceiver = (
  receiver: ts.Expression,
  checker: ts.TypeChecker
): boolean => {
  if (!ts.isIdentifier(receiver)) return false
  const symbol = checker.getSymbolAtLocation(receiver)
  if (!symbol) return false
  if (symbol.declarations?.some(ts.isNamespaceImport)) return true
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  return (target.flags & ts.SymbolFlags.ValueModule) !== 0
}

const followSymbol = (
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  names: string[],
  depth: number
): void => {
  if (!symbol || depth > MAX_DEPTH) return

  let target = symbol
  if (symbol.flags & ts.SymbolFlags.Alias) {
    const declaration = symbol.declarations?.[0]
    if (
      declaration &&
      (ts.isImportSpecifier(declaration) || ts.isExportSpecifier(declaration))
    ) {
      names.push((declaration.propertyName ?? declaration.name).text)
    }
    target = checker.getAliasedSymbol(symbol)
    // An import from a module the program cannot resolve: the specifier's own
    // exported name is the only identity there is.
    if (!target.declarations?.length) return
    names.push(target.getName())
  }

  const declaration = target.valueDeclaration
  if (
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer &&
    ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const
  ) {
    collectNames(declaration.initializer, checker, names, depth + 1)
  }
}

const collectNames = (
  expression: ts.Expression,
  checker: ts.TypeChecker,
  names: string[],
  depth: number
): void => {
  const callee = unwrap(expression)
  if (ts.isIdentifier(callee)) {
    names.push(callee.text)
    followSymbol(checker.getSymbolAtLocation(callee), checker, names, depth)
  } else if (
    ts.isPropertyAccessExpression(callee) &&
    isNamespaceReceiver(unwrap(callee.expression), checker)
  ) {
    names.push(callee.name.text)
    followSymbol(
      checker.getSymbolAtLocation(callee.name),
      checker,
      names,
      depth
    )
  }
}

/**
 * Every name a callee answers to, from its spelling at the call site to the
 * declaration it resolves to: through import and re-export aliases, members
 * of a namespace import, and `const` bindings of another name.
 */
export const calleeNames = (
  expression: ts.Expression,
  checker: ts.TypeChecker
): readonly string[] => {
  let cache = namesCache.get(checker)
  if (!cache) {
    cache = new WeakMap()
    namesCache.set(checker, cache)
  }
  const cached = cache.get(expression)
  if (cached) return cached

  const names: string[] = []
  collectNames(expression, checker, names, 0)
  cache.set(expression, names)
  return names
}

const isInsideDeclarationOf = (
  node: ts.Node,
  isKnown: (name: string) => boolean
): boolean => {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (ts.isVariableDeclaration(current) ||
        ts.isFunctionDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name) &&
      isKnown(current.name.text)
    ) {
      return true
    }
  }
  return false
}

/**
 * The pikku helper a call invokes, identified by what its callee resolves to
 * rather than how it is spelled, so `import { addTagMiddleware as guard }` and
 * `mw.addTagMiddleware(...)` are seen for what they are.
 *
 * The deepest known name wins, because it is the declaration's own: an alias
 * that happens to look like another helper (`pikkuFunc as pikkuOpenFunc`) is
 * still the helper it imports. A call inside the body of a helper's own
 * declaration — the generated `#pikku` wrappers forwarding to `@pikku/core` —
 * is the helper's implementation, not a use of it, and keeps the meaning its
 * literal spelling gives it.
 */
export const resolveCalleeName = (
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  known: NameMatcher
): string | undefined => {
  const isKnown = matcher(known)
  const names = calleeNames(call.expression, checker)
  let resolved: string | undefined
  for (let i = names.length - 1; i >= 0; i--) {
    if (isKnown(names[i]!)) {
      resolved = names[i]
      break
    }
  }
  if (!resolved) return undefined

  const spelled = ts.isIdentifier(call.expression)
    ? call.expression.text
    : undefined
  if (resolved !== spelled && isInsideDeclarationOf(call, isKnown)) {
    return spelled !== undefined && isKnown(spelled) ? spelled : undefined
  }
  return resolved
}
