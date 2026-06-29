import ts from 'typescript'

/** Base services the host injects; never constructed or returned by a carved addon. */
const BASE_SERVICES = new Set([
  'config',
  'logger',
  'variables',
  'secrets',
  'schema',
])

export interface LiftResult {
  /** Generated `src/services.ts` in `pikkuAddonServices` form. */
  servicesText: string
  /** Services the addon owns (constructed locally, not injected). */
  ownedServices: string[]
  /** Base services the owned construction reads — injected into the factory. */
  injectedBase: string[]
  /** Secret ids read via `secrets.getSecret(...)` in the owned construction. */
  secretReads: string[]
  /** Variable ids read via `variables.get(...)` in the owned construction. */
  variableReads: string[]
  /** Lift was not possible (shape not recognised); caller falls back/gates. */
  error?: string
}

/**
 * Lift a runnable project's `createSingletonServices` (a `pikkuServices` factory
 * that builds base services with local fallbacks and then constructs the addon's
 * own services) into the carved `pikkuAddonServices` form: base services move to
 * the injected destructure param, their fallback bindings drop, and the return
 * keeps only the owned services. Tree-shaking removes the now-unused base-service
 * constructors from the consumed build.
 *
 * Recognised source shape (what the runnable-project conversion emits):
 *   export const createSingletonServices = pikkuServices(
 *     async (_config, existingServices) => {
 *       const variables = existingServices?.variables ?? new LocalVariablesService(...)
 *       const secrets   = existingServices?.secrets   ?? new LocalSecretService(variables)
 *       const logger    = existingServices?.logger    ?? new ConsoleLogger()
 *       const creds = await secrets.getSecret<DeeplSecrets>('DEEPL_CREDENTIALS')
 *       const deepl = new DeeplService(creds)
 *       return { logger, variables, secrets, deepl }
 *     }
 *   )
 */
export function liftAddonConstruction(servicesText: string): LiftResult {
  const fail = (error: string): LiftResult => ({
    servicesText: '',
    ownedServices: [],
    injectedBase: [],
    secretReads: [],
    variableReads: [],
    error,
  })

  const sf = ts.createSourceFile(
    'services.ts',
    servicesText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  )

  const arrow = findFactoryArrow(sf, 'pikkuServices')
  if (!arrow) return fail('createSingletonServices = pikkuServices(...) not found')
  if (!ts.isBlock(arrow.body)) return fail('factory body is not a block')

  const statements = arrow.body.statements
  const ret = statements.find(ts.isReturnStatement)
  if (!ret || !ret.expression || !ts.isObjectLiteralExpression(ret.expression)) {
    return fail('factory does not return an object literal')
  }

  // Returned service names (shorthand or `name: value`).
  const returned: string[] = []
  for (const prop of ret.expression.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) returned.push(prop.name.text)
    else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      returned.push(prop.name.text)
    }
  }
  const ownedServices = returned.filter((s) => !BASE_SERVICES.has(s))
  if (ownedServices.length === 0) {
    return fail('no owned (non-base) services to carve')
  }

  // Partition body statements: base-service fallback bindings vs owned construction.
  const ownedStatements: ts.Statement[] = []
  for (const st of statements) {
    if (st === ret) continue
    if (isBaseFallbackBinding(st)) continue
    ownedStatements.push(st)
  }

  // Base services referenced by the owned construction → inject them.
  const referenced = new Set<string>()
  for (const st of ownedStatements) collectIdentifiers(st, referenced)
  const injectedBase = [...BASE_SERVICES].filter((b) => referenced.has(b))

  // Secret/variable ids read in the owned construction.
  const secretReads = collectStringLiteralCalls(ownedStatements, [
    'getSecret',
    'getSecretJSON',
  ])
  const variableReads = collectStringLiteralCalls(ownedStatements, ['get'], 'variables')

  const bodyText = ownedStatements
    .map((st) => '    ' + st.getText(sf).trim())
    .join('\n')
  const returnText = `    return { ${ownedServices.join(', ')} }`
  const param =
    injectedBase.length > 0 ? `{ ${injectedBase.join(', ')} }` : '{}'

  const generated = `import { pikkuAddonServices } from '#pikku'
${liftImports(sf, ownedStatements)}
// Services this addon owns — constructed from the host-injected base services.
export const createSingletonServices = pikkuAddonServices(
  async (_config, ${param}) => {
${bodyText}
${returnText}
  }
)
`

  return {
    servicesText: generated,
    ownedServices,
    injectedBase,
    secretReads,
    variableReads,
  }
}

/** Find `export const createSingletonServices = <wrapper>(<arrow>)`. */
function findFactoryArrow(
  sf: ts.SourceFile,
  wrapper: string
): ts.ArrowFunction | null {
  let found: ts.ArrowFunction | null = null
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === wrapper &&
      n.arguments.length > 0 &&
      ts.isArrowFunction(n.arguments[0]!)
    ) {
      found = n.arguments[0] as ts.ArrowFunction
    }
    if (!found) ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

/** `const NAME = existingServices?.NAME ?? ...` for NAME in BASE_SERVICES. */
function isBaseFallbackBinding(st: ts.Statement): boolean {
  if (!ts.isVariableStatement(st)) return false
  for (const d of st.declarationList.declarations) {
    if (!ts.isIdentifier(d.name) || !BASE_SERVICES.has(d.name.text)) return false
    if (
      !d.initializer ||
      !ts.isBinaryExpression(d.initializer) ||
      d.initializer.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken
    ) {
      return false
    }
  }
  return st.declarationList.declarations.length > 0
}

function collectIdentifiers(node: ts.Node, out: Set<string>): void {
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) out.add(n.text)
    ts.forEachChild(n, visit)
  }
  visit(node)
}

/**
 * String-literal first arguments of calls `<methods>(...)`, optionally only when
 * the call target is `<receiver>.method`.
 */
function collectStringLiteralCalls(
  statements: ts.Statement[],
  methods: string[],
  receiver?: string
): string[] {
  const ids = new Set<string>()
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      methods.includes(n.expression.name.text) &&
      (!receiver ||
        (ts.isIdentifier(n.expression.expression) &&
          n.expression.expression.text === receiver)) &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0]!)
    ) {
      ids.add((n.arguments[0] as ts.StringLiteralLike).text)
    }
    ts.forEachChild(n, visit)
  }
  for (const st of statements) visit(st)
  return [...ids]
}

/** Re-emit the source imports the owned construction still needs (drops base + bootstrap). */
function liftImports(sf: ts.SourceFile, ownedStatements: ts.Statement[]): string {
  const used = new Set<string>()
  for (const st of ownedStatements) collectIdentifiers(st, used)

  const lines: string[] = []
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteralLike(st.moduleSpecifier)) {
      continue
    }
    const spec = st.moduleSpecifier.text
    if (spec.includes('pikku-bootstrap') || spec === '#pikku') continue
    const clause = st.importClause
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue
    const kept = clause.namedBindings.elements.filter((el) => used.has(el.name.text))
    if (kept.length === 0) continue
    const typeOnly = clause.isTypeOnly ? 'type ' : ''
    lines.push(
      `import ${typeOnly}{ ${kept.map((e) => e.name.text).join(', ')} } from '${spec}'`
    )
  }
  return lines.join('\n')
}
