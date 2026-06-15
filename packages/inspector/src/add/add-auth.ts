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
 * Find the first `betterAuth({...})` call anywhere inside the `defineAuth`
 * factory body. Supports both `(s) => betterAuth({...})` and
 * `(s) => { ...; return betterAuth({...}) }`.
 */
const findBetterAuthCall = (
  node: ts.Node
): ts.CallExpression | undefined => {
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

/**
 * Collect the services a non-destructured factory reaches for by scanning its
 * body for `<paramName>.<service>` member accesses, e.g. `services.kysely`,
 * `services.secrets`. Lets the `(services) => betterAuth(...)` form still produce
 * an optimized service set instead of falling back to "all services".
 */
const extractServicesFromMemberAccess = (
  factory: ts.ArrowFunction | ts.FunctionExpression,
  paramName: string
): string[] => {
  const found = new Set<string>()
  const visit = (n: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === paramName &&
      ts.isIdentifier(n.name)
    ) {
      found.add(n.name.text)
    }
    ts.forEachChild(n, visit)
  }
  if (factory.body) visit(factory.body)
  return [...found]
}

/**
 * Detects `defineAuth((services) => betterAuth({...}))` calls.
 *
 * `defineAuth` is pure: it wraps a factory that returns a configured better-auth
 * instance and has NO side effects. The user assigns it to an exported binding,
 * e.g.
 *
 *   export const auth = defineAuth(async (services) => betterAuth({ ... }))
 *
 * The pikku CLI discovers that single export and generates a catch-all
 * `auth.gen.ts` that wires `${basePath}/**` to one shared handler, registers the
 * better-auth session middleware, and emits a `wireSecret` for every configured
 * social provider — so the auth routes and secret requirements flow through
 * normal inspection into the deploy manifest.
 *
 * This add-wiring records the exported binding name, source file, basePath, the
 * `socialProviders` keys, whether email/password is enabled, and the services
 * the factory touches. Exactly one `defineAuth` is allowed per codebase.
 */
export const addAuth: AddWiring = (logger, node, _checker, state) => {
  if (!ts.isCallExpression(node)) return

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'defineAuth') return

  const sourceFile = node.getSourceFile().fileName

  // Walk up to the `export const <name> = defineAuth(...)` binding.
  const varDecl = node.parent
  if (!ts.isVariableDeclaration(varDecl) || !ts.isIdentifier(varDecl.name)) {
    logger.critical(
      ErrorCode.AUTH_NOT_EXPORTED,
      `defineAuth(...) must be assigned to an exported const, e.g. \`export const auth = defineAuth((services) => betterAuth({...}))\` in ${sourceFile}`
    )
    return
  }
  const exportName = varDecl.name.text

  // VariableDeclaration -> VariableDeclarationList -> VariableStatement
  const declList = varDecl.parent
  const varStatement = declList?.parent
  const isExported =
    varStatement &&
    ts.isVariableStatement(varStatement) &&
    varStatement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  if (!isExported) {
    logger.critical(
      ErrorCode.AUTH_NOT_EXPORTED,
      `defineAuth(...) must be assigned to an exported const so the CLI can import it. Add \`export\` to \`const ${exportName}\` in ${sourceFile}`
    )
    return
  }

  if (state.auth.definition) {
    logger.critical(
      ErrorCode.DUPLICATE_AUTH_DEFINITION,
      `Only one defineAuth(...) is allowed per codebase. Found a second in ${sourceFile} (first: ${state.auth.definition.sourceFile}).`
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
      `defineAuth(...) must take a factory function returning betterAuth(...), e.g. \`defineAuth((services) => betterAuth({...}))\` in ${sourceFile}`
    )
    return
  }

  state.auth.files.add(sourceFile)

  // Derive the services the factory touches. A destructured first param names
  // them directly; a plain `(services) =>` is scanned for `services.<name>`.
  let services: FunctionServicesMeta
  const firstParam = factory.parameters[0]
  if (firstParam && ts.isObjectBindingPattern(firstParam.name)) {
    services = extractServicesFromFunction(factory)
  } else if (firstParam && ts.isIdentifier(firstParam.name)) {
    const accessed = extractServicesFromMemberAccess(
      factory,
      firstParam.name.text
    )
    services = { optimized: true, services: accessed }
  } else {
    services = { optimized: true, services: [] }
  }

  // Find the inner betterAuth({...}) call to read providers/basePath/credentials.
  let basePath = DEFAULT_BASE_PATH
  let hasCredentials = false
  const betterAuthCall = findBetterAuthCall(factory)
  const config = betterAuthCall?.arguments[0]

  if (config && ts.isObjectLiteralExpression(config)) {
    basePath = readStringProp(config, 'basePath') ?? DEFAULT_BASE_PATH

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
          (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
            ? prop.name.text
            : undefined
        if (key && !state.auth.providers.includes(key)) {
          state.auth.providers.push(key)
        }
      }
    }
  } else {
    logger.warn(
      `defineAuth in ${sourceFile}: could not statically find a betterAuth({...}) call inside the factory — social provider secrets will not be auto-wired.`
    )
  }

  state.auth.definition = {
    exportName,
    sourceFile,
    basePath,
    hasCredentials,
    services,
  }
}
