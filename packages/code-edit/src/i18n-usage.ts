import type ts from 'typescript'
import { tsRuntime } from './lazy-typescript.js'
import { parseSource, sourceFiles } from './verify/source-checks.js'

/**
 * A module that holds the Paraglide message namespace: `.../i18n/messages` or
 * `.../paraglide/messages`, with or without an extension or `/index`.
 */
const MESSAGES_MODULE =
  /(?:^|\/)(?:i18n|paraglide)\/messages(?:\/index)?(?:\.[cm]?[jt]sx?)?$/

export type MessageSite = { file: string; line: number; text: string }

export type MessageUsage = {
  /** Every key referenced as `m.key`, `m['key']`, `m.key(...)` or `const { key } = m`. */
  keys: Set<string>
  /** Per key, the absolute paths of the source files that reference it. */
  usedIn: Map<string, Set<string>>
  /** Places where the namespace is read in a way that names no key, so a key could be used unseen. */
  computed: MessageSite[]
  /** Files the parser reported a syntax error in, or that could not be read. */
  unparsed: string[]
  files: number
}

/**
 * The local names under which a file imports the message namespace:
 * - `import { m } from '<any>/i18n/messages'` or `.../paraglide/messages` (also renamed: `{ m as _m }`),
 * - `import * as X from '<any>/i18n/messages'` or `.../paraglide/messages` (Paraglide's own shape),
 * - `import { m } from '<any module>'`: `m` imported under the name `m`.
 * A file that is itself such a module (`.../i18n/messages.ts`) defines the namespace, so its own
 * whole-namespace uses (wrapping, re-typing) are not reported. Re-exports (`export { m } from`) are declarations, not uses. A local `m` (parameter, block-level
 * variable, loop or catch variable) shadows the import and is ignored.
 */
const namespaceAliases = (sf: ts.SourceFile): Set<string> => {
  const aliases = new Set<string>()
  for (const stmt of sf.statements) {
    if (
      !tsRuntime.isImportDeclaration(stmt) ||
      !tsRuntime.isStringLiteral(stmt.moduleSpecifier)
    )
      continue
    const fromMessages = MESSAGES_MODULE.test(stmt.moduleSpecifier.text)
    const bindings = stmt.importClause?.namedBindings
    if (!bindings) continue
    if (tsRuntime.isNamespaceImport(bindings)) {
      if (fromMessages) aliases.add(bindings.name.text)
      continue
    }
    for (const el of bindings.elements) {
      const imported = (el.propertyName ?? el.name).text
      if (imported === 'm' && (fromMessages || !el.propertyName))
        aliases.add(el.name.text)
    }
  }
  return aliases
}

const isDeclarationName = (node: ts.Identifier): boolean => {
  const p = node.parent
  return (
    ((tsRuntime.isParameter(p) ||
      tsRuntime.isVariableDeclaration(p) ||
      tsRuntime.isBindingElement(p)) &&
      p.name === node) ||
    (tsRuntime.isPropertyAccessExpression(p) && p.name === node) ||
    (tsRuntime.isPropertyAssignment(p) && p.name === node) ||
    (tsRuntime.isQualifiedName(p) && p.right === node) ||
    (tsRuntime.isJsxAttribute(p) && p.name === node)
  )
}

const bindsName = (name: ts.BindingName, text: string): boolean =>
  tsRuntime.isIdentifier(name)
    ? name.text === text
    : name.elements.some(
        (el) => !tsRuntime.isOmittedExpression(el) && bindsName(el.name, text)
      )

const declaresName = (
  list: ts.VariableDeclarationList | ts.ForInitializer | undefined,
  text: string
): boolean =>
  !!list &&
  tsRuntime.isVariableDeclarationList(list) &&
  list.declarations.some((d) => bindsName(d.name, text))

/** Whether `node` refers to a local binding named `text` rather than the import (parameters, block-level declarations, loop and catch variables). */
const isShadowed = (node: ts.Identifier): boolean => {
  const text = node.text
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (tsRuntime.isSourceFile(p)) return false
    if (tsRuntime.isFunctionLike(p)) {
      if (p.parameters.some((param) => bindsName(param.name, text))) return true
      if (
        (tsRuntime.isFunctionExpression(p) ||
          tsRuntime.isFunctionDeclaration(p)) &&
        p.name?.text === text
      )
        return true
    } else if (
      tsRuntime.isBlock(p) ||
      tsRuntime.isModuleBlock(p) ||
      tsRuntime.isCaseBlock(p)
    ) {
      const statements = tsRuntime.isCaseBlock(p)
        ? p.clauses.flatMap((c) => [...c.statements])
        : p.statements
      for (const st of statements) {
        if (
          tsRuntime.isVariableStatement(st) &&
          declaresName(st.declarationList, text)
        )
          return true
        if (
          (tsRuntime.isFunctionDeclaration(st) ||
            tsRuntime.isClassDeclaration(st)) &&
          st.name?.text === text
        )
          return true
      }
    } else if (
      tsRuntime.isForStatement(p) ||
      tsRuntime.isForInStatement(p) ||
      tsRuntime.isForOfStatement(p)
    ) {
      if (declaresName(p.initializer, text)) return true
    } else if (tsRuntime.isCatchClause(p)) {
      if (p.variableDeclaration && bindsName(p.variableDeclaration.name, text))
        return true
    }
  }
  return false
}

/** Scans the whole workspace's `.ts`/`.tsx` for message keys; see `namespaceAliases` for how the namespace is recognised. */
export function scanMessageUsage(root: string): MessageUsage {
  const usage: MessageUsage = {
    keys: new Set(),
    usedIn: new Map(),
    computed: [],
    unparsed: [],
    files: 0,
  }
  for (const file of sourceFiles(root, { skipHidden: true })) {
    const parsed = parseSource(file)
    usage.files++
    if (!parsed || !parsed.ok) usage.unparsed.push(file)
    if (!parsed) continue
    const { sf } = parsed
    const aliases = namespaceAliases(sf)
    // The module that defines `m` (i18n/messages.ts) wraps the Paraglide namespace as a whole.
    const isDefinition = MESSAGES_MODULE.test(file)
    if (!aliases.size) continue
    const site = (node: ts.Node, why: string) =>
      usage.computed.push({
        file,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        text: `${why}: ${node.parent.getText(sf).replace(/\s+/g, ' ').slice(0, 100)}`,
      })
    const use = (key: string) => {
      usage.keys.add(key)
      let set = usage.usedIn.get(key)
      if (!set) usage.usedIn.set(key, (set = new Set()))
      set.add(file)
    }
    const visit = (node: ts.Node) => {
      if (
        tsRuntime.isImportDeclaration(node) ||
        tsRuntime.isExportDeclaration(node)
      )
        return
      if (
        tsRuntime.isIdentifier(node) &&
        aliases.has(node.text) &&
        !isDeclarationName(node) &&
        !isShadowed(node)
      ) {
        const p = node.parent
        if (tsRuntime.isPropertyAccessExpression(p) && p.expression === node) {
          use(p.name.text)
        } else if (tsRuntime.isQualifiedName(p) && p.left === node) {
          // `typeof m.key` in a type position
          use(p.right.text)
        } else if (
          tsRuntime.isElementAccessExpression(p) &&
          p.expression === node
        ) {
          const arg = p.argumentExpression
          if (tsRuntime.isStringLiteralLike(arg)) use(arg.text)
          else site(node, 'computed access')
        } else if (
          tsRuntime.isVariableDeclaration(p) &&
          p.initializer === node &&
          tsRuntime.isObjectBindingPattern(p.name)
        ) {
          for (const el of p.name.elements) {
            const name = el.propertyName ?? el.name
            if (
              el.dotDotDotToken ||
              (!tsRuntime.isIdentifier(name) &&
                !tsRuntime.isStringLiteralLike(name))
            )
              site(node, 'destructured with rest or computed name')
            else use((name as ts.Identifier | ts.StringLiteral).text)
          }
        } else if (!isDefinition) {
          site(node, 'namespace used as a value')
        }
      }
      tsRuntime.forEachChild(node, visit)
    }
    visit(sf)
  }
  return usage
}
