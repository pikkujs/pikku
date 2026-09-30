/**
 * The one `identifier` Tauri gives an app — the macOS and iOS bundle id and the
 * Android package name at once. Android is the strictest of the three, so its
 * rules are the rules; macOS adds only that the id must not end in `.app`.
 */

const JAVA_KEYWORDS = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'void',
  'volatile',
  'while',
])

const segmentOf = (raw: string): string =>
  raw.toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * `com.<scope>.<name>` from the root package's npm scope and the frontend's
 * name, hyphens removed — `@acme/shop` with frontend `customer-app` gives
 * `com.acme.customerapp`. An unscoped root package lends its own name instead.
 */
export const defaultNativeIdentifier = (
  rootPackageName: string | undefined,
  frontendName: string
): string => {
  const scoped = rootPackageName
    ? /^@([^/]+)\//.exec(rootPackageName)?.[1]
    : undefined
  const org = segmentOf(scoped ?? rootPackageName ?? '') || 'example'
  const name = segmentOf(frontendName) || 'app'
  const safe = (segment: string) =>
    /^[0-9]/.test(segment) || JAVA_KEYWORDS.has(segment)
      ? `app${segment}`
      : segment
  return `com.${safe(org)}.${safe(name)}`
}

/** Every reason `identifier` would be refused by one of the platforms, empty when none. */
export const nativeIdentifierProblems = (identifier: string): string[] => {
  const segments = identifier.split('.')
  const problems: string[] = []
  if (segments.length < 2) {
    problems.push(
      `"${identifier}" needs at least two dot-separated segments, like com.acme.shop`
    )
  }
  for (const segment of segments) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(segment)) {
      problems.push(
        `segment "${segment}" must start with a letter and hold only letters, digits and underscores — Android refuses anything else, hyphens included`
      )
    } else if (JAVA_KEYWORDS.has(segment)) {
      problems.push(
        `segment "${segment}" is a Java keyword, which Android refuses in a package name`
      )
    }
  }
  if (identifier.toLowerCase().endsWith('.app')) {
    problems.push(`"${identifier}" ends in ".app", which macOS refuses`)
  }
  return problems
}
