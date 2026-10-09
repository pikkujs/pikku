import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type ts from 'typescript'
import { tsRuntime } from '../lazy-typescript.js'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.pikku',
  'dist',
  'build',
  '.next',
  '.output',
  '.yarn',
  'paraglide',
])

/** Every `.ts`/`.tsx` file under `dir`, skipping vendor and generated directories (and, with `skipHidden`, every dot directory such as `.agents`). */
export function sourceFiles(
  dir: string,
  {
    includeGenerated = false,
    skipHidden = false,
  }: { includeGenerated?: boolean; skipHidden?: boolean } = {}
): string[] {
  const files: string[] = []
  const walk = (current: string, depth: number) => {
    if (depth > 12) return
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (
          !SKIP_DIRS.has(entry.name) &&
          !(skipHidden && entry.name.startsWith('.'))
        )
          walk(full, depth + 1)
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts') &&
        (includeGenerated || !entry.name.includes('.gen.'))
      ) {
        files.push(full)
      }
    }
  }
  walk(dir, 0)
  return files
}

/** Parses a `.ts`/`.tsx` file; `ok` is false when the parser reported a syntax error, and null when the file cannot be read. */
export function parseSource(
  file: string
): { sf: ts.SourceFile; text: string; ok: boolean } | null {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const sf = tsRuntime.createSourceFile(
    file,
    text,
    tsRuntime.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? tsRuntime.ScriptKind.TSX : tsRuntime.ScriptKind.TS
  )
  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] })
    .parseDiagnostics
  return { sf, text, ok: !diagnostics?.length }
}

const readSafe = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const lineOf = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length

export type SourceHit = { file: string; line: number; text: string }

export type AsI18nArgumentKind =
  | 'a string literal'
  | 'a template literal'
  | 'a call'
  | 'a concatenation'
  | 'an expression'

export type AsI18nArgumentHit = SourceHit & { kind: AsI18nArgumentKind }

const AS_I18N_SKIP_FILE = /\.(stories|test|spec)\.tsx?$/

/** `@pikku/react` defines `asI18n` itself, so its own file is the one place it may take anything. */
const AS_I18N_DEFINITION_FILE = /(^|\/)react\/src\/i18n-types\.ts$/

/** Unwraps what changes a reference's type but not what it is: parentheses, `as X`, `satisfies X`, `<X>x` and `x!`. */
const unwrapReference = (expr: ts.Expression): ts.Expression => {
  let current = expr
  while (
    tsRuntime.isParenthesizedExpression(current) ||
    tsRuntime.isAsExpression(current) ||
    tsRuntime.isNonNullExpression(current) ||
    tsRuntime.isTypeAssertionExpression(current) ||
    tsRuntime.isSatisfiesExpression(current)
  )
    current = current.expression
  return current
}

/** True for an identifier or a property-access chain on one (`name`, `a.b.c`, `a?.b`, `a!.b`), possibly wrapped. */
const isPlainReference = (expr: ts.Expression): boolean => {
  const inner = unwrapReference(expr)
  if (
    tsRuntime.isIdentifier(inner) ||
    inner.kind === tsRuntime.SyntaxKind.ThisKeyword
  )
    return true
  if (tsRuntime.isPropertyAccessExpression(inner))
    return isPlainReference(inner.expression)
  return false
}

const classifyAsI18nArgument = (expr: ts.Expression): AsI18nArgumentKind => {
  const inner = unwrapReference(expr)
  if (tsRuntime.isStringLiteral(inner)) return 'a string literal'
  if (
    tsRuntime.isNoSubstitutionTemplateLiteral(inner) ||
    tsRuntime.isTemplateExpression(inner)
  )
    return 'a template literal'
  if (tsRuntime.isCallExpression(inner)) return 'a call'
  if (
    tsRuntime.isBinaryExpression(inner) &&
    inner.operatorToken.kind === tsRuntime.SyntaxKind.PlusToken
  )
    return 'a concatenation'
  return 'an expression'
}

/**
 * The local names a helper is callable by in one file: its own name plus every `import { name as x }` alias,
 * minus the plain name when the file declares its own (that file is the helper's definition, not a caller).
 * Exact identifiers only, so `asI18n` never matches `asI18nStub`.
 */
const helperNames = (sf: ts.SourceFile, helper: string): Set<string> => {
  const names = new Set<string>([helper])
  for (const statement of sf.statements) {
    if (
      tsRuntime.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      tsRuntime.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const spec of statement.importClause.namedBindings.elements) {
        if ((spec.propertyName ?? spec.name).text === helper)
          names.add(spec.name.text)
      }
    }
    if (tsRuntime.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (tsRuntime.isIdentifier(decl.name) && decl.name.text === helper)
          names.delete(helper)
      }
    }
    if (
      tsRuntime.isFunctionDeclaration(statement) &&
      statement.name?.text === helper
    )
      names.delete(helper)
  }
  return names
}

/**
 * `asI18n(...)` arguments that are not a plain variable reference. The escape hatch brands outside data,
 * so anything written in place (a literal, a template, a concatenation, a ternary, a default, a call) is
 * copy or computation that skipped the message catalogue. Recognises the call by name, through
 * `import { asI18n as x }` and as `ns.asI18n(...)`. `.stories`, `.test` and `.spec` files are skipped.
 */
export function asI18nArguments(dir: string): AsI18nArgumentHit[] {
  const hits: AsI18nArgumentHit[] = []
  for (const file of sourceFiles(dir, { skipHidden: true })) {
    if (AS_I18N_SKIP_FILE.test(file) || AS_I18N_DEFINITION_FILE.test(file))
      continue
    const text = readSafe(file)
    if (!text.includes('asI18n')) continue
    const parsed = parseSource(file)
    if (!parsed) continue
    const { sf } = parsed
    const names = helperNames(sf, 'asI18n')
    const lines = text.split('\n')
    const visit = (node: ts.Node) => {
      if (tsRuntime.isCallExpression(node)) {
        const callee = node.expression
        const isAsI18n =
          (tsRuntime.isIdentifier(callee) && names.has(callee.text)) ||
          (tsRuntime.isPropertyAccessExpression(callee) &&
            callee.name.text === 'asI18n')
        const arg = node.arguments[0]
        if (isAsI18n && arg && !isPlainReference(arg)) {
          const line = sf.getLineAndCharacterOfPosition(arg.getStart(sf)).line
          hits.push({
            file,
            line: line + 1,
            text: (lines[line] ?? '').trim().slice(0, 160),
            kind: tsRuntime.isSpreadElement(arg)
              ? 'an expression'
              : classifyAsI18nArgument(arg),
          })
        }
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return hits
}

export type AsI18nStubHit = SourceHit & {
  /** The first argument, trimmed to 60 characters. */
  copy: string
}

/**
 * Every `asI18nStub(...)` call: the inventory of fixture copy that still has to be productised. Recognised by
 * name, through `import { asI18nStub as x }` and as `ns.asI18nStub(...)`, the way `usePikkuQueryStub` is found by
 * the mocks check. The definition file, `.stories`, `.test` and `.spec` files are skipped.
 */
export function asI18nStubs(dir: string): AsI18nStubHit[] {
  const hits: AsI18nStubHit[] = []
  for (const file of sourceFiles(dir, { skipHidden: true })) {
    if (AS_I18N_SKIP_FILE.test(file) || AS_I18N_DEFINITION_FILE.test(file))
      continue
    const text = readSafe(file)
    if (!text.includes('asI18nStub')) continue
    const parsed = parseSource(file)
    if (!parsed) continue
    const { sf } = parsed
    const names = helperNames(sf, 'asI18nStub')
    const lines = text.split('\n')
    const visit = (node: ts.Node) => {
      if (tsRuntime.isCallExpression(node)) {
        const callee = node.expression
        const isStub =
          (tsRuntime.isIdentifier(callee) && names.has(callee.text)) ||
          (tsRuntime.isPropertyAccessExpression(callee) &&
            callee.name.text === 'asI18nStub')
        if (isStub) {
          const [arg] = node.arguments
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
          const copy = arg
            ? tsRuntime.isStringLiteral(arg) ||
              tsRuntime.isNoSubstitutionTemplateLiteral(arg)
              ? arg.text
              : arg.getText(sf)
            : ''
          hits.push({
            file,
            line: line + 1,
            text: (lines[line] ?? '').trim().slice(0, 160),
            copy: copy.replace(/\s+/g, ' ').trim().slice(0, 60),
          })
        }
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return hits
}

export type SepArgumentHit = SourceHit & {
  /** Why the argument is not a separator. */
  reason: string
}

/** Module specifiers `sep` may be imported from: the package and its subpaths. */
const REACT_MODULE = /^@pikku\/react(\/|$)/
/** Inside the react package's own source, `sep` arrives by a relative import. */
const REACT_SOURCE_FILE = /(^|\/)react\/src\//
const REACT_RELATIVE_MODULE =
  /^\.{1,2}\/(?:.*\/)?(?:i18n-types|index)(?:\.js)?$/

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/**
 * The local names `helper` is callable by in one file, counting only bindings imported from `@pikku/react`
 * (or, inside the react package's source, from its own `i18n-types` / `index`), plus the local names of
 * namespace imports from there. A same-named function from anywhere else, or declared in the file, is not it.
 */
const importedHelperBindings = (
  sf: ts.SourceFile,
  helper: string,
  file: string
): { names: Set<string>; namespaces: Set<string> } => {
  const names = new Set<string>()
  const namespaces = new Set<string>()
  const inReactSource = REACT_SOURCE_FILE.test(file)
  for (const statement of sf.statements) {
    if (
      !tsRuntime.isImportDeclaration(statement) ||
      !tsRuntime.isStringLiteral(statement.moduleSpecifier)
    )
      continue
    const spec = statement.moduleSpecifier.text
    if (
      !REACT_MODULE.test(spec) &&
      !(inReactSource && REACT_RELATIVE_MODULE.test(spec))
    )
      continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings) continue
    if (tsRuntime.isNamespaceImport(bindings))
      namespaces.add(bindings.name.text)
    else
      for (const el of bindings.elements)
        if ((el.propertyName ?? el.name).text === helper)
          names.add(el.name.text)
  }
  return { names, namespaces }
}

/**
 * `sep(...)` calls whose argument is not a non-empty string literal (or no-substitution template) made only
 * of whitespace, punctuation and symbols. Mirrors the `sep` type in `@pikku/react`, for callers that cast or
 * bypass the type. Only calls whose binding is imported from `@pikku/react` count (named import, alias, or
 * `ns.sep(...)` on a namespace import), so a local `sep` or one from another library is left alone, and
 * `separate`, `asI18nSep` and `sepFoo` never match. `.stories`, `.test` and `.spec` files and the definition
 * file are skipped.
 */
export function sepArguments(dir: string): SepArgumentHit[] {
  const hits: SepArgumentHit[] = []
  for (const file of sourceFiles(dir, { skipHidden: true })) {
    if (AS_I18N_SKIP_FILE.test(file) || AS_I18N_DEFINITION_FILE.test(file))
      continue
    const text = readSafe(file)
    if (!/\bsep\b/.test(text)) continue
    const parsed = parseSource(file)
    if (!parsed) continue
    const { sf } = parsed
    const { names, namespaces } = importedHelperBindings(sf, 'sep', file)
    if (names.size === 0 && namespaces.size === 0) continue
    const lines = text.split('\n')
    const visit = (node: ts.Node) => {
      if (tsRuntime.isCallExpression(node)) {
        const callee = node.expression
        const isSep =
          (tsRuntime.isIdentifier(callee) && names.has(callee.text)) ||
          (tsRuntime.isPropertyAccessExpression(callee) &&
            callee.name.text === 'sep' &&
            tsRuntime.isIdentifier(callee.expression) &&
            namespaces.has(callee.expression.text))
        if (isSep) {
          const arg = node.arguments[0]
          const inner =
            arg && !tsRuntime.isSpreadElement(arg)
              ? unwrapReference(arg)
              : undefined
          let reason: string | undefined
          if (
            !inner ||
            !(
              tsRuntime.isStringLiteral(inner) ||
              tsRuntime.isNoSubstitutionTemplateLiteral(inner)
            )
          )
            reason = 'not a string literal'
          else if (inner.text === '') reason = 'empty'
          else if (LETTER_OR_DIGIT.test(inner.text))
            reason = 'contains a letter or digit'
          if (reason) {
            const line = sf.getLineAndCharacterOfPosition(
              node.getStart(sf)
            ).line
            hits.push({
              file,
              line: line + 1,
              text: (lines[line] ?? '').trim().slice(0, 160),
              reason,
            })
          }
        }
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return hits
}

export type BrokenCatalog = { file: string; error: string }

/** Message catalogs under `<appDir>/messages` that are not valid JSON; Paraglide keeps serving the last good compile, so every newer key reads as missing. */
export function brokenMessageCatalogs(appDir: string): BrokenCatalog[] {
  const messagesDir = join(appDir, 'messages')
  if (!existsSync(messagesDir)) return []
  const broken: BrokenCatalog[] = []
  for (const name of readdirSync(messagesDir).filter((f) =>
    f.endsWith('.json')
  )) {
    const file = join(messagesDir, name)
    try {
      JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      broken.push({
        file,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return broken
}

const ZOD_GEN_IMPORT =
  /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*zod\.gen(?:\.js)?['"]/g
const ZOD_GEN_EXPORT =
  /^export\s+(?:declare\s+)?(?:const|type|interface|enum|class|function)\s+([A-Za-z_$][\w$]*)/gm

export type StaleZodImport = { file: string; line: number; name: string }

/** Names source imports from the generated table zod (`<outDir>/db/zod.gen.ts`) that it does not export; null when that file was never generated. */
export function staleTableZod(
  srcDirs: readonly string[],
  outDir: string
): StaleZodImport[] | null {
  const generated = readSafe(join(outDir, 'db', 'zod.gen.ts'))
  if (!generated) return null
  const exported = new Set<string>()
  for (const match of generated.matchAll(ZOD_GEN_EXPORT))
    exported.add(match[1]!)
  const missing: StaleZodImport[] = []
  const seen = new Set<string>()
  for (const dir of srcDirs) {
    for (const file of sourceFiles(dir)) {
      const text = readSafe(file)
      if (!text.includes('zod.gen')) continue
      for (const match of text.matchAll(ZOD_GEN_IMPORT)) {
        for (const raw of match[1]!.split(',')) {
          const name = raw
            .replace(/^\s*type\s+/, '')
            .split(/\s+as\s+/)[0]!
            .trim()
          if (!name || exported.has(name) || seen.has(name)) continue
          seen.add(name)
          missing.push({ file, line: lineOf(text, match.index), name })
        }
      }
    }
  }
  return missing
}

/** Strings the Fabric Studio lint config allows bare in JSX: separators and ellipses carry no language. */
export const ALLOWED_JSX_STRINGS: readonly string[] = ['·', '—', '…']

/** The tsconfig a frontend adds to switch the i18n DOM-types gate (`@pikku/react/i18n-jsx`) on. */
export const I18N_GATE_TSCONFIG = 'tsconfig.i18n.json'

/** True when `dir` (a frontend or package root) has the gate switched on. */
export const hasI18nGate = (dir: string): boolean =>
  existsSync(join(dir, I18N_GATE_TSCONFIG))

/** A lowercase tag (`div`, `svg`, `text`): a DOM or SVG element, whose text the gate types. Components, member tags and fragments are not. */
const isIntrinsicTag = (tag: ts.JsxTagNameExpression): boolean =>
  tsRuntime.isIdentifier(tag) && /^[a-z]/.test(tag.text)

/** The element a child (JsxText or JsxExpression) or an attribute belongs to, or null for a fragment. */
const owningTag = (node: ts.Node): ts.JsxTagNameExpression | null => {
  const parent = node.parent
  if (tsRuntime.isJsxElement(parent)) return parent.openingElement.tagName
  if (tsRuntime.isJsxAttributes(parent)) return parent.parent.tagName
  return null
}

const JSX_LITERAL_SKIP_FILE = /\.(stories|test|spec)\.tsx$/

export type JsxLiteralHit = SourceHit

/**
 * Hardcoded copy written directly as JSX children: bare text (`<div>Hello</div>`) and string
 * literals in a child expression (`<div>{'Hello'}</div>`). Attributes are ignored, as are texts
 * with no letter in them (`/`, `•`, digits) and the allowed separator strings.
 *
 * When `dir` has a `tsconfig.i18n.json` (or `gated` is true) the type gate owns the children of
 * lowercase DOM and SVG elements, so only fragments and component elements are reported here.
 */
export function jsxLiteralText(
  dir: string,
  allowed: readonly string[] = ALLOWED_JSX_STRINGS,
  { gated = hasI18nGate(dir) }: { gated?: boolean } = {}
): JsxLiteralHit[] {
  const hits: JsxLiteralHit[] = []
  for (const file of sourceFiles(dir)) {
    if (!file.endsWith('.tsx') || JSX_LITERAL_SKIP_FILE.test(file)) continue
    const text = readSafe(file)
    if (!text) continue
    const sf = tsRuntime.createSourceFile(
      file,
      text,
      tsRuntime.ScriptTarget.Latest,
      true,
      tsRuntime.ScriptKind.TSX
    )
    const report = (node: ts.Node, value: string) => {
      const tag = owningTag(node)
      if (gated && tag && isIntrinsicTag(tag)) return
      const trimmed = value.replace(/\s+/g, ' ').trim()
      if (!trimmed || allowed.includes(trimmed) || !/\p{L}/u.test(trimmed))
        return
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
      hits.push({ file, line: line + 1, text: trimmed.slice(0, 160) })
    }
    const visit = (node: ts.Node) => {
      if (tsRuntime.isJsxText(node)) {
        report(node, node.text)
      } else if (
        tsRuntime.isJsxExpression(node) &&
        node.expression &&
        (tsRuntime.isJsxElement(node.parent) ||
          tsRuntime.isJsxFragment(node.parent)) &&
        (tsRuntime.isStringLiteral(node.expression) ||
          tsRuntime.isNoSubstitutionTemplateLiteral(node.expression))
      ) {
        report(node, node.expression.text)
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return hits
}

/**
 * Props that carry user-facing copy when given a string, on a component or a fragment-free JSX element. Extend this
 * list to teach the check a new component API. On a lowercase DOM or SVG element the check stands down whenever the
 * frontend has a `tsconfig.i18n.json`: the type gate (`@pikku/react/i18n-jsx`) owns `title`, `placeholder`, `alt`,
 * `label` and the `aria-*` text attributes there, so nothing is reported twice. Without that file every element is
 * checked, as before.
 */
export const COPY_PROPS: readonly string[] = [
  'title',
  'sub',
  'crumb',
  'text',
  'label',
  'placeholder',
  'aria-label',
  'alt',
  'description',
  'tooltip',
  'what',
  'hint',
  'heading',
  'caption',
  'helperText',
]

/** Props that carry copy on any component, whatever the allowlist says. */
export const COPY_PROP_PATTERN =
  /^(aria-label|aria-description|title|placeholder|alt)$/

/** Props whose strings are never copy: styling, identity, routing, variants and code samples. */
const NON_COPY_PROPS = new Set([
  'className',
  'class',
  'id',
  'key',
  'href',
  'src',
  'type',
  'name',
  'value',
  'defaultValue',
  'variant',
  'size',
  'to',
  'rel',
  'target',
  'role',
  'code',
  'sample',
  'lang',
  'language',
  'style',
  'color',
  'testId',
])

/** Calls whose string arguments are shown to the person: `say('Saved')`, `toast.success('Saved')`. */
export const COPY_HELPER_CALLS: readonly string[] = ['say', 'toast', 'notify']

export type JsxLiteralPropHit = SourceHit & { via: string }

/** True when a string reads as a sentence or a label a person would see, not a token, path, URL or class list. */
export function looksLikeCopy(
  value: string,
  allowed: readonly string[] = ALLOWED_JSX_STRINGS
): boolean {
  const s = value.replace(/\s+/g, ' ').trim()
  if (!s || allowed.includes(s) || !/\p{L}/u.test(s)) return false
  if (/^(https?:|mailto:|tel:|data:|\/|\.{1,2}\/|#|@)/i.test(s)) return false
  const hasSpace = s.includes(' ')
  if (!hasSpace) {
    // one word: copy only when capitalised and plain letters (no dots, slashes, dashes between parts)
    return /^\p{Lu}[\p{L}'’]+[.!?…:]*$/u.test(s)
  }
  // code written as a string (an import line, a statement) is a sample, not copy
  const bare = s.replace(/\{…\}/g, '')
  if (/[;{}]|=>|\bimport\b.*\bfrom\b/.test(bare)) return false
  // several words: CSS class lists, selectors and key paths are not copy
  const tokens = s.split(' ')
  if (
    tokens.every((t) => /^[a-z0-9_:/[\]().%#,=-]+$/.test(t)) &&
    tokens.some((t) => /[-_:/[\]=.\d]/.test(t))
  )
    return false
  return true
}

/** The literal strings an expression can evaluate to directly: through ternaries, `||`, `??`, `&&`, parentheses and template literals. Calls are not entered. */
function literalStrings(expr: ts.Expression): string[] {
  if (
    tsRuntime.isParenthesizedExpression(expr) ||
    tsRuntime.isAsExpression(expr)
  )
    return literalStrings(expr.expression)
  if (
    tsRuntime.isStringLiteral(expr) ||
    tsRuntime.isNoSubstitutionTemplateLiteral(expr)
  )
    return [expr.text]
  if (tsRuntime.isTemplateExpression(expr)) {
    return [
      expr.head.text +
        expr.templateSpans.map((s) => '{…}' + s.literal.text).join(''),
    ]
  }
  if (tsRuntime.isConditionalExpression(expr))
    return [...literalStrings(expr.whenTrue), ...literalStrings(expr.whenFalse)]
  if (tsRuntime.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (
      op === tsRuntime.SyntaxKind.BarBarToken ||
      op === tsRuntime.SyntaxKind.QuestionQuestionToken
    )
      return [...literalStrings(expr.left), ...literalStrings(expr.right)]
    if (op === tsRuntime.SyntaxKind.AmpersandAmpersandToken)
      return literalStrings(expr.right)
  }
  return []
}

/** True for an attribute or child of a lowercase element: copy the type gate already rejects. Helper-call arguments never are. */
const ownedByGate = (node: ts.Node): boolean => {
  if (!tsRuntime.isJsxAttribute(node) && !tsRuntime.isJsxExpression(node))
    return false
  const tag = owningTag(node)
  return tag !== null && isIntrinsicTag(tag)
}

const inCodeElement = (node: ts.Node): boolean => {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    const tag = tsRuntime.isJsxElement(p)
      ? p.openingElement.tagName.getText()
      : tsRuntime.isJsxSelfClosingElement(p)
        ? p.tagName.getText()
        : ''
    if (tag === 'code' || tag === 'pre') return true
  }
  return false
}

/**
 * Hardcoded copy that `jsxLiteralText` cannot see: string and template literals in copy props
 * (`title="Hello"`, `label={`Step ${n}`}`), literals reached through `?:`, `||`, `??` or a template in a
 * JSX child expression, and string arguments to helper calls such as `say('Saved')`. Direct `{'text'}`
 * children stay with `jsxLiteralText`.
 */
export function jsxLiteralProps(
  dir: string,
  {
    allowed = ALLOWED_JSX_STRINGS,
    props = COPY_PROPS,
    helpers = COPY_HELPER_CALLS,
    gated = hasI18nGate(dir),
  }: {
    allowed?: readonly string[]
    props?: readonly string[]
    helpers?: readonly string[]
    /** The type gate is on for this frontend: lowercase DOM and SVG elements are not reported. Defaults to whether `dir` has a `tsconfig.i18n.json`. */
    gated?: boolean
  } = {}
): JsxLiteralPropHit[] {
  const hits: JsxLiteralPropHit[] = []
  for (const file of sourceFiles(dir, { skipHidden: true })) {
    if (!file.endsWith('.tsx') || JSX_LITERAL_SKIP_FILE.test(file)) continue
    const parsed = parseSource(file)
    if (!parsed) continue
    const { sf } = parsed
    const report = (node: ts.Node, value: string, via: string) => {
      if (gated && ownedByGate(node)) return
      if (!looksLikeCopy(value, allowed)) return
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
      hits.push({
        file,
        line: line + 1,
        via,
        text: value.replace(/\s+/g, ' ').trim().slice(0, 160),
      })
    }
    const visit = (node: ts.Node) => {
      if (tsRuntime.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(sf)
        const isCopy =
          !NON_COPY_PROPS.has(name) &&
          !name.startsWith('data-') &&
          (props.includes(name) || COPY_PROP_PATTERN.test(name))
        if (isCopy && !inCodeElement(node)) {
          const init = node.initializer
          const exprs = tsRuntime.isStringLiteral(init)
            ? [init as ts.Expression]
            : tsRuntime.isJsxExpression(init) && init.expression
              ? [init.expression]
              : []
          for (const e of exprs)
            for (const s of literalStrings(e)) report(node, s, name)
        }
      } else if (
        tsRuntime.isJsxExpression(node) &&
        node.expression &&
        (tsRuntime.isJsxElement(node.parent) ||
          tsRuntime.isJsxFragment(node.parent)) &&
        !inCodeElement(node)
      ) {
        const e = node.expression
        const direct =
          tsRuntime.isStringLiteral(e) ||
          tsRuntime.isNoSubstitutionTemplateLiteral(e)
        if (!direct) for (const s of literalStrings(e)) report(node, s, 'child')
      } else if (tsRuntime.isCallExpression(node)) {
        const callee = node.expression
        const name = tsRuntime.isIdentifier(callee)
          ? callee.text
          : tsRuntime.isPropertyAccessExpression(callee) &&
              tsRuntime.isIdentifier(callee.expression)
            ? callee.expression.text
            : ''
        if (name && helpers.includes(name) && !inCodeElement(node)) {
          for (const arg of node.arguments)
            for (const s of literalStrings(arg)) report(arg, s, `${name}()`)
        }
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return hits
}

export type StringLiteralCopyHit = SourceHit

/**
 * Files whose strings are never shown to a person: tests, stories, scenario/feature/step files, and Pikku
 * function and workflow definitions (their `title` and `description` document the function for developers).
 */
const COPY_SKIP_FILE =
  /(\.(stories|test|spec|scenario|feature|step|function|workflow|agent|wiring)\.tsx?$|(^|\/)(__tests__|tests?|scenarios|e2e)\/|\.config\.[cm]?tsx?$)/

/** Callee roots (`console.log`, `m.title`, `expect(x).toBe`) and bare calls whose string arguments are never copy. */
const NON_COPY_CALL_ROOTS = new Set([
  'console',
  'logger',
  'log',
  'debug',
  'm',
  'asI18n',
  'asI18nStub',
  'sep',
  'require',
  'describe',
  'it',
  'test',
  'expect',
  'assert',
  'suite',
  'before',
  'after',
  'beforeEach',
  'afterEach',
  'cn',
  'clsx',
  'cva',
  'twMerge',
  'classNames',
  'JSON',
  'Intl',
  'Symbol',
  'Object',
  'Reflect',
  'RegExp',
  'Date',
  'process',
  'path',
  'fs',
  'sql',
  'css',
  'tw',
  'import',
  'git',
  'execa',
  'scenario',
  'workflow',
  'res',
  'reply',
  'logger',
])

/** Methods whose string arguments are keys, selectors, patterns, events or log text, whatever they are called on. */
const NON_COPY_METHODS = new Set([
  'log',
  'debug',
  'info',
  'warn',
  'trace',
  'test',
  'match',
  'matchAll',
  'replace',
  'replaceAll',
  'split',
  'join',
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'lastIndexOf',
  'localeCompare',
  'padStart',
  'padEnd',
  'querySelector',
  'querySelectorAll',
  'getAttribute',
  'setAttribute',
  'removeAttribute',
  'hasAttribute',
  'addEventListener',
  'removeEventListener',
  'on',
  'once',
  'off',
  'emit',
  'get',
  'set',
  'has',
  'delete',
  'append',
  'getItem',
  'setItem',
  'removeItem',
  'prepare',
  'exec',
  'run',
  'all',
  'query',
  'execute',
  'select',
  'from',
  'where',
  'with',
  'withSchema',
  'raw',
  'describe',
  'it',
  'test',
  'equal',
  'deepEqual',
  'strictEqual',
  'notEqual',
  'ok',
  'throws',
  'rejects',
  'toBe',
  'toEqual',
  'toContain',
  'toMatch',
  'toThrow',
  'invalidateQueries',
  'setQueryData',
  'getQueryData',
  'rpc',
  'invoke',
  'func',
  'execSync',
  'spawn',
  'spawnSync',
  'exec',
  'readFile',
  'writeFile',
  'resolve',
  'join',
  'relative',
  'cwd',
  'parse',
  'format',
  'select',
  'attr',
  'css',
  'closest',
  'matches',
  'getElementById',
  'getByRole',
  'getByText',
  'getByLabelText',
  'getByTestId',
  'findByText',
  'findByRole',
  'createContext',
  'createLogger',
  'child',
  'tag',
  'header',
  'headers',
  'setHeader',
  'getHeader',
  'cookie',
  'redirect',
  'navigate',
  'push',
  'to',
  'is',
  'type',
  'literal',
  'enum',
  'string',
  'default',
  'regex',
  'column',
  'table',
  'index',
  'unique',
  'references',
  'sort',
  'orderBy',
  'groupBy',
  'selectFrom',
  'insertInto',
  'updateTable',
  'deleteFrom',
  'as',
  'end',
  'write',
  'writeHead',
  'send',
  'do',
  'given',
  'when',
  'then',
  'and',
  'step',
  'commit',
])

const COPY_PROP_NAME_SKIP =
  /^(className|class|classes|classNames|style|styles|sx|css|tw|id|ids|key|keys|href|src|url|uri|path|route|to|from|type|kind|name|slug|value|values|variant|size|color|colour|icon|role|rel|target|lang|locale|language|method|mode|status|format|pattern|regex|selector|query|sql|command|cmd|cwd|dir|file|filename|ext|mime|mimeType|contentType|accept|env|token|secret|channel|topic|event|action|scope|permission|permissions|resource|table|column|field|model|provider|version|origin|host|domain|port|encoding|charset|transition|animation|display|position|width|height|font|fontFamily|fontSize|fontWeight|border|background|boxShadow|shadow|content|data|testId|fill|stroke|d|viewBox|transform|cursor|ariaRole|as|queryKey|queryFn|cron|schedule|expression|template|prompt|instructions|systemPrompt|system|description_for_model)$|(Class|ClassName|Classes|Style|Styles|Id|Ids|Key|Url|Href|Path|Selector|Regex|Pattern|Icon|Color|Env|Slug|Type|Kind|Name|Sql|Query|Cmd|Command|Dir|File|Mime|Format|Token|Secret|Prompt|Template)$/

const SENTENCE_END = /[.!?…:]$/

/**
 * True when `text` reads as English a person would see: two or more words (whitespace between two tokens that
 * each hold a letter), and not a class list, URL, path, code, SQL, selector or key path.
 */
export function readsAsEnglish(text: string): boolean {
  const s = text.replace(/\s+/g, ' ').trim()
  // a long run, a bullet list or a multi-line template is a prompt or a document, not a label or message
  if (
    s.length < 5 ||
    s.length > 200 ||
    /^[-*#>]\s/.test(s) ||
    !/\p{L}/u.test(s)
  )
    return false
  const tokens = s.split(' ')
  const wordTokens = tokens.filter((t) => /\p{L}/u.test(t))
  if (wordTokens.length < 2) return false
  if (
    /^(https?:|mailto:|tel:|data:|file:|\/|\.{1,2}\/|#|@|~\/|\$\{?[A-Z_]+\}?\/)/i.test(
      s
    )
  )
    return false
  if (
    /[;{}]|=>|===|\bimport\b.*\bfrom\b|<\/?[a-z][^>]*>|\$\{[^}]*\}\s*\(/.test(s)
  )
    return false
  if (
    /^(select|insert|update|delete|create|alter|drop|with|pragma|begin|commit|truncate)\s/i.test(
      s
    ) &&
    /\b(from|into|set|table|where|values|index|select|transaction)\b/i.test(s)
  )
    return false
  if (
    /^(git|npm|npx|pnpm|yarn|bun|node|tsc|pikku|fabric|docker|curl|cd|ls|rm|mkdir|cp|mv|chmod|sh|bash|echo|cat|grep|sed|awk|brew|apt|pip|python3?)\s+-?[\w./@:-]*/.test(
      s
    ) &&
    !SENTENCE_END.test(s) &&
    tokens.length > 1 &&
    /(^|\s)-{1,2}[a-z]|\s[\w@./-]+\/[\w./-]+/.test(s)
  )
    return false
  // css values and shorthand: `1px solid red`, `0 0 0 1px`, `calc(100% - 4px)`
  if (
    /^[\d.\-+]+(px|rem|em|%|vh|vw|s|ms|fr)?\s/.test(s) &&
    !SENTENCE_END.test(s)
  )
    return false
  if (
    /\b(calc|var|rgba?|hsla?|oklch|url|translate\w*|rotate|scale|linear-gradient|min|max|clamp)\(/.test(
      s
    )
  )
    return false
  // identifiers and key paths joined by spaces
  if (
    tokens.every((t) => /^[a-z0-9_:/[\]().%#,=@*&|<>+!'"`~$^?\\-]+$/.test(t)) &&
    tokens.some((t) => /[-_:/[\]=.\d@*&|<>+!~$^?\\()%#,]/.test(t))
  )
    return false
  if (
    tokens.every((t) => /^[A-Za-z0-9_$]+$/.test(t)) &&
    tokens.every((t) => /^[a-z]/.test(t) && /[A-Z_]/.test(t.slice(1)))
  )
    return false
  // a lowercase run with no capital, no sentence punctuation and fewer than three words is a label for a machine
  // (`flex grow`, `no cache`); copy starts with a capital or runs to a sentence
  if (!/^\p{Lu}/u.test(s) && !SENTENCE_END.test(s) && wordTokens.length < 3)
    return false
  return true
}

const rootName = (expr: ts.Expression): string => {
  let cur: ts.Expression = expr
  while (true) {
    if (
      tsRuntime.isPropertyAccessExpression(cur) ||
      tsRuntime.isElementAccessExpression(cur)
    )
      cur = cur.expression
    else if (tsRuntime.isCallExpression(cur)) cur = cur.expression
    else if (
      tsRuntime.isNonNullExpression(cur) ||
      tsRuntime.isParenthesizedExpression(cur) ||
      tsRuntime.isAsExpression(cur)
    )
      cur = cur.expression
    else break
  }
  if (tsRuntime.isIdentifier(cur)) return cur.text
  if (cur.kind === tsRuntime.SyntaxKind.ImportKeyword) return 'import'
  return ''
}

const memberName = (callee: ts.Expression): string =>
  tsRuntime.isPropertyAccessExpression(callee)
    ? callee.name.text
    : tsRuntime.isIdentifier(callee)
      ? callee.text
      : ''

const propertyKeyName = (name: ts.PropertyName): string =>
  tsRuntime.isIdentifier(name) ||
  tsRuntime.isStringLiteral(name) ||
  tsRuntime.isNumericLiteral(name) ||
  tsRuntime.isNoSubstitutionTemplateLiteral(name)
    ? name.text
    : tsRuntime.isComputedPropertyName(name)
      ? ''
      : name.getText()

/** True when the literal, in the position `node` gives it, is one this check reads: see `stringLiteralCopy`. */
function copyPosition(
  node: ts.Expression,
  copyHelpers: readonly string[],
  inTsx: boolean
): boolean {
  let child: ts.Node = node
  let parent: ts.Node | undefined = node.parent
  while (parent) {
    if (
      tsRuntime.isParenthesizedExpression(parent) ||
      tsRuntime.isAsExpression(parent) ||
      tsRuntime.isSatisfiesExpression(parent) ||
      tsRuntime.isNonNullExpression(parent) ||
      tsRuntime.isTypeAssertionExpression(parent)
    ) {
      child = parent
      parent = parent.parent
      continue
    }
    if (tsRuntime.isConditionalExpression(parent)) {
      if (parent.condition === child) return false
      child = parent
      parent = parent.parent
      continue
    }
    if (tsRuntime.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind
      const through =
        op === tsRuntime.SyntaxKind.BarBarToken ||
        op === tsRuntime.SyntaxKind.QuestionQuestionToken ||
        (op === tsRuntime.SyntaxKind.AmpersandAmpersandToken &&
          parent.right === child)
      if (!through) return false
      child = parent
      parent = parent.parent
      continue
    }
    break
  }
  if (!parent) return false
  if (tsRuntime.isPropertyAssignment(parent) && parent.initializer === child) {
    const key = propertyKeyName(parent.name)
    if (
      key === '' ||
      COPY_PROP_NAME_SKIP.test(key) ||
      key.startsWith('data-') ||
      (key.startsWith('aria-') && !/^aria-(label|description)$/.test(key))
    )
      return false
    // a property of a JSX-ish style object or an HTTP header map
    return true
  }
  if (tsRuntime.isArrayLiteralExpression(parent)) return arrayIsCopy(parent)
  if (tsRuntime.isReturnStatement(parent)) return true
  if (tsRuntime.isArrowFunction(parent) && parent.body === child) return true
  if (tsRuntime.isParameter(parent) && parent.initializer === child) return true
  if (tsRuntime.isBindingElement(parent) && parent.initializer === child)
    return true
  if (tsRuntime.isPropertyDeclaration(parent) && parent.initializer === child)
    return !COPY_PROP_NAME_SKIP.test(parent.name.getText())
  if (tsRuntime.isVariableDeclaration(parent) && parent.initializer === child) {
    if (!tsRuntime.isIdentifier(parent.name)) return true
    return (
      (!COPY_PROP_NAME_SKIP.test(parent.name.text) &&
        !/^[A-Z][A-Z0-9_]*$/.test(parent.name.text)) ||
      /MESSAGE|COPY|TEXT|LABEL|TITLE|HINT/.test(parent.name.text)
    )
  }
  if (tsRuntime.isCallExpression(parent) || tsRuntime.isNewExpression(parent)) {
    if (!parent.arguments?.includes(child as ts.Expression)) return false
    const callee = parent.expression
    if (tsRuntime.isNewExpression(parent)) {
      const n = memberName(callee)
      if (
        /Error$|^(RegExp|Date|URL|Map|Set|Headers|URLSearchParams|Intl\w*)$/.test(
          n
        )
      )
        return false
    }
    const root = rootName(callee)
    const method = memberName(callee)
    if (copyHelpers.includes(root)) return !inTsx // jsxLiteralProps already reports these in .tsx
    if (
      NON_COPY_CALL_ROOTS.has(root) ||
      (root === '' && tsRuntime.isCallExpression(callee))
    )
      return false
    if (NON_COPY_METHODS.has(method)) return false
    if (/Error$/.test(method) || /^(throw|fail|panic|invariant)/.test(method))
      return false
    if (
      tsRuntime.isIdentifier(callee) &&
      /^(use[A-Z]|create[A-Z]|define[A-Z]|wire[A-Z]|pikku[A-Z]|import|require)/.test(
        callee.text
      )
    )
      return false
    return true
  }
  return false
}

/** An array of strings that are all identifiers/keys is a list of tokens, not copy: only report arrays whose siblings are not all single words. */
function arrayIsCopy(array: ts.ArrayLiteralExpression): boolean {
  const parent = array.parent
  if (tsRuntime.isPropertyAssignment(parent)) {
    const key = propertyKeyName(parent.name)
    if (COPY_PROP_NAME_SKIP.test(key)) return false
  }
  if (
    tsRuntime.isVariableDeclaration(parent) &&
    tsRuntime.isIdentifier(parent.name) &&
    COPY_PROP_NAME_SKIP.test(parent.name.text)
  )
    return false
  if (tsRuntime.isCallExpression(parent) && parent.arguments.includes(array)) {
    const n = memberName(parent.expression)
    if (
      NON_COPY_METHODS.has(n) ||
      NON_COPY_CALL_ROOTS.has(rootName(parent.expression))
    )
      return false
  }
  return true
}

/**
 * English written outside JSX: string and template literals in `.ts`/`.tsx` that read as sentences or labels
 * (see `readsAsEnglish`) and sit where copy lives: an object property value, an array element, a return or
 * arrow-body value, a default, either branch of `?:` / `||` / `??`, a call argument or a variable initialiser.
 * Not reported: import/export specifiers, JSX attributes (jsx-literal-prop owns them), property keys, types,
 * styling and identity props, URLs, paths, code, `console.*`, `Error` messages, `m.*`, `asI18n*`, `sep`, test
 * helpers, `.test`/`.spec`/`.stories`/`.d.ts` files, generated files.
 */
export function stringLiteralCopy(
  dir: string,
  { copyHelpers = COPY_HELPER_CALLS }: { copyHelpers?: readonly string[] } = {}
): StringLiteralCopyHit[] {
  const hits: StringLiteralCopyHit[] = []
  for (const file of sourceFiles(dir, { skipHidden: true })) {
    if (COPY_SKIP_FILE.test(file)) continue
    const parsed = parseSource(file)
    if (!parsed) continue
    const { sf } = parsed
    const inTsx = file.endsWith('.tsx')
    const visit = (node: ts.Node) => {
      if (
        tsRuntime.isImportDeclaration(node) ||
        tsRuntime.isExportDeclaration(node) ||
        tsRuntime.isImportEqualsDeclaration(node) ||
        tsRuntime.isTypeNode(node) ||
        tsRuntime.isJsxAttribute(node) ||
        tsRuntime.isJsxText(node) ||
        tsRuntime.isTypeAliasDeclaration(node) ||
        tsRuntime.isInterfaceDeclaration(node) ||
        tsRuntime.isDecorator(node)
      )
        return
      if (
        tsRuntime.isJsxExpression(node) &&
        (tsRuntime.isJsxElement(node.parent) ||
          tsRuntime.isJsxFragment(node.parent)) &&
        node.expression &&
        (tsRuntime.isStringLiteral(node.expression) ||
          tsRuntime.isNoSubstitutionTemplateLiteral(node.expression) ||
          tsRuntime.isTemplateExpression(node.expression))
      )
        return
      let value: string | undefined
      if (
        tsRuntime.isStringLiteral(node) ||
        tsRuntime.isNoSubstitutionTemplateLiteral(node)
      )
        value = node.text
      else if (tsRuntime.isTemplateExpression(node))
        value =
          node.head.text +
          node.templateSpans.map((sp) => '{…}' + sp.literal.text).join('')
      if (value !== undefined) {
        const expr = node as ts.Expression
        // a template that runs over several lines is a prompt or a document, not a label or a message
        const multiline =
          !tsRuntime.isStringLiteral(node) && /\n/.test(node.getText(sf))
        if (
          !multiline &&
          readsAsEnglish(value.replace(/\{…\}/g, ' ')) &&
          copyPosition(expr, copyHelpers, inTsx)
        ) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
          hits.push({
            file,
            line: line + 1,
            text: value.replace(/\s+/g, ' ').trim().slice(0, 160),
          })
        }
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return hits
}
