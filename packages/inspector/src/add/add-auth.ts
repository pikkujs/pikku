import * as ts from 'typescript'
import type { FunctionServicesMeta } from '@pikku/core'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'
import { extractServicesFromFunction } from '../utils/extract-services.js'

/**
 * The pikku function id of the single shared auth handler the CLI generates
 * (`export const authHandler = pikkuSessionlessFunc(...)` in auth.gen.ts). An
 * exported top-level const collapses the catch-all `/api/auth/**` route onto one
 * worker, and the export name becomes the function id. Shared with the CLI
 * codegen and the post-process service stamp so all three agree on the same id
 * without the inspector having to import `@pikku/better-auth`.
 */
export const AUTH_HANDLER_FUNC_ID = 'authHandler'

/** The default better-auth base path when `basePath` is not configured. */
const DEFAULT_BASE_PATH = '/api/auth'

/**
 * Find the first `betterAuth({...})` call anywhere inside the `pikkuBetterAuth`
 * factory body. Supports both `(s) => betterAuth({...})` and
 * `(s) => { ...; return betterAuth({...}) }`.
 */
const findBetterAuthCall = (node: ts.Node): ts.CallExpression | undefined => {
  let found: ts.CallExpression | undefined
  const visit = (n: ts.Node) => {
    if (found) return
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'betterAuth'
    ) {
      found = n
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/** Read a string-literal property off an object literal, if present. */
const readStringProp = (
  obj: ts.ObjectLiteralExpression,
  name: string
): string | undefined => {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
  ) as ts.PropertyAssignment | undefined
  if (prop && ts.isStringLiteral(prop.initializer)) return prop.initializer.text
  return undefined
}

/** Find an object-literal-valued property off an object literal, if present. */
const readObjectProp = (
  obj: ts.ObjectLiteralExpression,
  name: string
): ts.ObjectLiteralExpression | undefined => {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
  ) as ts.PropertyAssignment | undefined
  if (prop && ts.isObjectLiteralExpression(prop.initializer))
    return prop.initializer
  return undefined
}

/** Find an array-literal-valued property off an object literal, if present. */
const readArrayProp = (
  obj: ts.ObjectLiteralExpression,
  name: string
): ts.ArrayLiteralExpression | undefined => {
  const prop = obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
  ) as ts.PropertyAssignment | undefined
  if (prop && ts.isArrayLiteralExpression(prop.initializer))
    return prop.initializer
  return undefined
}

/**
 * Read the callee name of a `plugins: [...]` entry. better-auth plugins are
 * factory calls (`bearer()`, `twoFactor({ ... })`, `admin()`); the entry's id
 * is the called function's name. Member-expression callees (`foo.bar()`) and
 * non-call entries are ignored.
 */
const readPluginId = (el: ts.Expression): string | undefined => {
  if (ts.isCallExpression(el) && ts.isIdentifier(el.expression))
    return el.expression.text
  return undefined
}

/**
 * True when `node` sits inside a GLOBAL middleware registration — i.e. an actual
 * global registration, not a bare standalone call or a route-scoped one.
 *
 * `addGlobalMiddleware(...)` is always global. `addHTTPMiddleware` is global only
 * in its array form (`addHTTPMiddleware([...])`) or with the `'*'` wildcard
 * pattern; a specific route pattern (`addHTTPMiddleware('/api/admin/*', [...])`)
 * scopes the middleware to that route and must NOT count as a global stateless
 * registration (#754).
 */
const isInsideGlobalMiddlewareRegistration = (node: ts.Node): boolean => {
  let parent: ts.Node | undefined = node.parent
  while (parent) {
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)) {
      const fn = parent.expression.text
      if (fn === 'addGlobalMiddleware') return true
      if (fn === 'addHTTPMiddleware') {
        const first = parent.arguments[0]
        if (!first) return false
        // String first arg → route pattern (global only when '*'); otherwise
        // the array form, which is global.
        return ts.isStringLiteral(first) ? first.text === '*' : true
      }
    }
    parent = parent.parent
  }
  return false
}

/**
 * Detects `pikkuBetterAuth((services) => betterAuth({...}))` calls.
 *
 * `pikkuBetterAuth` is pure: it wraps a factory that returns a configured better-auth
 * instance and has NO side effects. The user assigns it to an exported binding,
 * e.g.
 *
 *   export const auth = pikkuBetterAuth(async (services) => betterAuth({ ... }))
 *
 * The pikku CLI discovers that single export and generates a catch-all
 * `auth.gen.ts` that wires `${basePath}/**` to one shared handler, registers the
 * better-auth session middleware, and emits a `wireSecret` for every configured
 * social provider — so the auth routes and secret requirements flow through
 * normal inspection into the deploy manifest.
 *
 * This add-wiring records the exported binding name, source file, basePath, the
 * `socialProviders` keys, whether email/password is enabled, and the services
 * the factory touches. Exactly one `pikkuBetterAuth` is allowed per codebase.
 */
export const addAuth: AddWiring = (logger, node, _checker, state) => {
  if (!ts.isCallExpression(node)) return

  const expression = node.expression

  // A user-registered stateless session middleware (custom mapSession) means the
  // CLI must NOT auto-generate its own default-map one — the generated one runs
  // first and pre-empts the user's via the `if (session) next()` short-circuit
  // (pikkujs/pikku#754). Only a GLOBAL registration counts (inside
  // addHTTPMiddleware/addGlobalMiddleware) — a bare betterAuthStatelessSession()
  // call (e.g. a test harness) is not a registration. Ignore generated files so
  // the emitted middleware can't self-trigger the skip.
  if (
    ts.isIdentifier(expression) &&
    expression.text === 'betterAuthStatelessSession' &&
    !node.getSourceFile().fileName.endsWith('.gen.ts') &&
    isInsideGlobalMiddlewareRegistration(node)
  ) {
    state.auth.userStatelessSession = true
  }

  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuBetterAuth')
    return

  const sourceFile = node.getSourceFile().fileName

  // Walk up to the `export const <name> = pikkuBetterAuth(...)` binding.
  const varDecl = node.parent
  if (!ts.isVariableDeclaration(varDecl) || !ts.isIdentifier(varDecl.name)) {
    logger.critical(
      ErrorCode.AUTH_NOT_EXPORTED,
      `pikkuBetterAuth(...) must be assigned to an exported const, e.g. \`export const auth = pikkuBetterAuth((services) => betterAuth({...}))\` in ${sourceFile}`
    )
    return
  }
  const exportName = varDecl.name.text

  // VariableDeclaration -> VariableDeclarationList -> VariableStatement
  const declList = varDecl.parent
  const varStatement = declList?.parent
  const isConst =
    ts.isVariableDeclarationList(declList) &&
    (declList.flags & ts.NodeFlags.Const) !== 0
  const isExported =
    varStatement &&
    ts.isVariableStatement(varStatement) &&
    varStatement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  if (!isExported || !isConst) {
    logger.critical(
      ErrorCode.AUTH_NOT_EXPORTED,
      `pikkuBetterAuth(...) must be assigned to an exported const so the CLI can import it. Use \`export const ${exportName} = pikkuBetterAuth(...)\` in ${sourceFile}`
    )
    return
  }

  if (state.auth.definition) {
    logger.critical(
      ErrorCode.DUPLICATE_AUTH_DEFINITION,
      `Only one pikkuBetterAuth(...) is allowed per codebase. Found a second in ${sourceFile} (first: ${state.auth.definition.sourceFile}).`
    )
    return
  }

  // The single argument must be the factory: (services) => betterAuth({...}).
  const factory = node.arguments[0]
  if (
    !factory ||
    (!ts.isArrowFunction(factory) && !ts.isFunctionExpression(factory))
  ) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `pikkuBetterAuth(...) must take a factory function returning betterAuth(...), e.g. \`pikkuBetterAuth((services) => betterAuth({...}))\` in ${sourceFile}`
    )
    return
  }

  state.auth.files.add(sourceFile)

  // Derive the services the factory touches from its destructured first param —
  // the same convention as every other pikku wiring. A non-destructured param
  // yields optimized:false (handler gets all singleton services), with the
  // standard diagnostic steering the user to destructure.
  const services: FunctionServicesMeta = extractServicesFromFunction(factory)

  // Find the inner betterAuth({...}) call to read providers/basePath/credentials.
  let basePath = DEFAULT_BASE_PATH
  let hasCredentials = false
  let cookieCache = false
  const betterAuthCall = findBetterAuthCall(factory)
  const config = betterAuthCall?.arguments[0]

  if (config && ts.isObjectLiteralExpression(config)) {
    basePath = readStringProp(config, 'basePath') ?? DEFAULT_BASE_PATH

    // Detect `session.cookieCache.enabled` → drives the stateless middleware split.
    const session = readObjectProp(config, 'session')
    if (session) {
      const cookieCacheBlock = readObjectProp(session, 'cookieCache')
      if (cookieCacheBlock) {
        const enabledProp = cookieCacheBlock.properties.find(
          (p) =>
            ts.isPropertyAssignment(p) &&
            (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
            p.name.text === 'enabled'
        ) as ts.PropertyAssignment | undefined
        cookieCache =
          !enabledProp ||
          enabledProp.initializer.kind !== ts.SyntaxKind.FalseKeyword
      }
    }

    const emailAndPassword = readObjectProp(config, 'emailAndPassword')
    if (emailAndPassword) {
      // `emailAndPassword: { enabled: true }` — treat a present block without an
      // explicit `enabled: false` as credentials being available.
      const enabledProp = emailAndPassword.properties.find(
        (p) =>
          ts.isPropertyAssignment(p) &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'enabled'
      ) as ts.PropertyAssignment | undefined
      hasCredentials =
        !enabledProp ||
        enabledProp.initializer.kind !== ts.SyntaxKind.FalseKeyword
    }

    const socialProviders = readObjectProp(config, 'socialProviders')
    if (socialProviders) {
      for (const prop of socialProviders.properties) {
        const key =
          (ts.isPropertyAssignment(prop) ||
            ts.isShorthandPropertyAssignment(prop)) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
            ? prop.name.text
            : undefined
        if (key && !state.auth.providers.includes(key)) {
          state.auth.providers.push(key)
        }
      }
    }

    const plugins = readArrayProp(config, 'plugins')
    if (plugins) {
      for (const el of plugins.elements) {
        const id = readPluginId(el)
        if (id && !state.auth.plugins.includes(id)) {
          state.auth.plugins.push(id)
        }
      }
    }
  } else {
    logger.warn(
      `pikkuBetterAuth in ${sourceFile}: could not statically find a betterAuth({...}) call inside the factory — social provider secrets will not be auto-wired.`
    )
  }

  state.auth.definition = {
    exportName,
    sourceFile,
    basePath,
    hasCredentials,
    cookieCache,
    plugins: [...state.auth.plugins],
    services,
  }
}
