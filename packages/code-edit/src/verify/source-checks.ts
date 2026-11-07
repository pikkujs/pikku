import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  scanAsI18nArguments,
  scanAsI18nStubs,
  scanJsxLiteralProps,
  scanJsxLiteralText,
  scanSepArguments,
  scanStringLiteralCopy,
} from '@pikku/inspector-go'

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
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
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

/**
 * `asI18n(...)` arguments that are not a plain variable reference. The escape hatch brands outside data,
 * so anything written in place (a literal, a template, a concatenation, a ternary, a default, a call) is
 * copy or computation that skipped the message catalogue. Recognises the call by name, through
 * `import { asI18n as x }` and as `ns.asI18n(...)`. `.stories`, `.test` and `.spec` files are skipped.
 */
export function asI18nArguments(dir: string): AsI18nArgumentHit[] {
  return scanAsI18nArguments(dir) as AsI18nArgumentHit[]
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
  return scanAsI18nStubs(dir)
}

export type SepArgumentHit = SourceHit & {
  /** Why the argument is not a separator. */
  reason: string
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
  return scanSepArguments(dir)
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

/** Strings the Pikku Studio lint config allows bare in JSX: separators and ellipses carry no language. */
export const ALLOWED_JSX_STRINGS: readonly string[] = ['·', '—', '…']

/** The tsconfig a frontend adds to switch the i18n DOM-types gate (`@pikku/react/i18n-jsx`) on. */
export const I18N_GATE_TSCONFIG = 'tsconfig.i18n.json'

/** True when `dir` (a frontend or package root) has the gate switched on. */
export const hasI18nGate = (dir: string): boolean =>
  existsSync(join(dir, I18N_GATE_TSCONFIG))

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
  return scanJsxLiteralText(dir, allowed, gated)
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
  return scanJsxLiteralProps(dir, { allowed, props, helpers, gated })
}

export type StringLiteralCopyHit = SourceHit

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
    /^(git|npm|npx|pnpm|yarn|bun|node|tsc|pikku|cloud|docker|curl|cd|ls|rm|mkdir|cp|mv|chmod|sh|bash|echo|cat|grep|sed|awk|brew|apt|pip|python3?)\s+-?[\w./@:-]*/.test(
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
  return scanStringLiteralCopy(dir, copyHelpers)
}
