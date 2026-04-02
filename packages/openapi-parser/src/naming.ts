/**
 * Derives function/method names from HTTP method + path.
 * Uses operationId when available, otherwise generates from path segments.
 */

/** JavaScript/TypeScript reserved words that cannot be used as identifiers */
const JS_RESERVED_WORDS = new Set([
  // ECMAScript reserved words
  'abstract',
  'arguments',
  'await',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'let',
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
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'volatile',
  'while',
  'with',
  'yield',
  // TypeScript additional reserved words in strict mode
  'as',
  'any',
  'declare',
  'get',
  'module',
  'require',
  'number',
  'object',
  'set',
  'string',
  'symbol',
  'type',
  'from',
  'of',
])

/**
 * Ensure a name is a valid JS/TS identifier:
 * - Not a reserved word
 * - Does not start with a digit
 * - Does not contain numeric separator patterns (e.g. 1_000)
 */
export function sanitizeIdentifier(name: string): string {
  // Strip numeric separator patterns like 1_000 → 1000
  name = name.replace(/(\d)_(\d)/g, '$1$2')

  // Strip any remaining invalid characters
  name = name.replace(/[^a-zA-Z0-9_$]/g, '')

  // Prefix with 'n' if name starts with a digit (not underscore, since
  // pikku inspector may strip leading underscores from type names)
  if (/^[0-9]/.test(name)) {
    name = 'n' + name
  }

  // Prefix with underscore if name is a reserved word
  if (JS_RESERVED_WORDS.has(name)) {
    name = '_' + name
  }

  return name || 'unnamed'
}

const IRREGULAR_PLURALS: Record<string, string> = {
  addresses: 'address',
  statuses: 'status',
  indices: 'index',
  analyses: 'analysis',
  quizzes: 'quiz',
  matrices: 'matrix',
  vertices: 'vertex',
  aliases: 'alias',
  buses: 'bus',
}

export function singularize(word: string): string {
  const lower = word.toLowerCase()
  if (IRREGULAR_PLURALS[lower]) {
    const singular = IRREGULAR_PLURALS[lower]
    return word[0] === word[0].toUpperCase()
      ? singular.charAt(0).toUpperCase() + singular.slice(1)
      : singular
  }
  if (lower.endsWith('ies') && lower.length > 4) {
    return word.slice(0, -3) + 'y'
  }
  // -shes, -ches, -xes, -zes, -sses → drop "es"
  if (
    lower.endsWith('shes') ||
    lower.endsWith('ches') ||
    lower.endsWith('xes') ||
    lower.endsWith('zes') ||
    lower.endsWith('sses')
  ) {
    return word.slice(0, -2)
  }
  // General: drop trailing "s" (covers courses→course, products→product, etc.)
  if (
    lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    lower.length > 2
  ) {
    return word.slice(0, -1)
  }
  return word
}

export function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]+$/g, '') // strip trailing non-alphanumeric chars
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
}

export function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * Strip common API prefix from paths (e.g. /api/v2/).
 * Uses majority voting — a prefix shared by >75% of paths is stripped,
 * so a few outlier paths (e.g. /oauth/...) don't break detection.
 */
export function detectCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return ''

  const segments = paths.map((p) => p.replace(/^\//, '').split('/'))
  const threshold = Math.ceil(paths.length * 0.75)

  // Find the longest prefix shared by at least `threshold` paths
  let prefixLen = 0
  for (let i = 0; i < 10; i++) {
    // Count how many paths have the same segment at position i as the first path
    const candidateSeg = segments[0][i]
    if (!candidateSeg || candidateSeg.startsWith('{')) break

    const count = segments.filter(
      (s) => s.length > i + 1 && s[i] === candidateSeg
    ).length

    if (count >= threshold) {
      prefixLen = i + 1
    } else {
      break
    }
  }

  if (prefixLen === 0) return ''
  return '/' + segments[0].slice(0, prefixLen).join('/') + '/'
}

/** Convert operationId to camelCase function name */
function fromOperationId(operationId: string): string {
  // operationId might be snake_case, camelCase, PascalCase, or kebab-case
  let name =
    toCamelCase(
      operationId
        .replace(/[{}]/g, '') // strip curly braces from path parameters
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/[-_]+/g, '_')
        .replace(/^_|_$/g, '')
    ) || 'unnamed'

  return sanitizeIdentifier(name)
}

const METHOD_PREFIXES: Record<string, string> = {
  get: 'get',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete',
}

interface OperationForNaming {
  method: string
  path: string
  operationId?: string
}

export interface NamedOperation {
  method: string
  path: string
  functionName: string
  methodName: string
}

/**
 * Generate function names for a list of operations.
 * Handles collision detection and auto-deduplication.
 */
export function generateOperationNames(
  operations: OperationForNaming[],
  commonPrefix: string
): NamedOperation[] {
  const results: NamedOperation[] = []
  const usedNames = new Map<string, number>()
  // Track names case-insensitively to prevent file system collisions on
  // case-insensitive systems (macOS, Windows). Two operationIds that differ
  // only in casing (e.g. userGetOauth2Application vs userGetOAuth2Application)
  // would produce files that collide on disk.
  const usedNamesLower = new Map<string, number>()

  for (const op of operations) {
    let name: string

    if (op.operationId) {
      name = fromOperationId(op.operationId)
    } else {
      name = deriveNameFromPath(op.method, op.path, commonPrefix)
    }

    // Ensure name is a valid JS/TS identifier
    name = sanitizeIdentifier(name)

    // Handle collisions (case-insensitive to avoid file system conflicts)
    const nameLower = name.toLowerCase()
    const existingExact = usedNames.get(name) ?? 0
    const existingCI = usedNamesLower.get(nameLower) ?? 0
    const existing = Math.max(existingExact, existingCI)
    if (existing > 0) {
      usedNames.set(name, existing + 1)
      usedNamesLower.set(nameLower, existing + 1)
      name = `${name}${existing + 1}`
    }
    usedNames.set(name, (usedNames.get(name) ?? 0) || 1)
    usedNamesLower.set(
      name.toLowerCase(),
      (usedNamesLower.get(name.toLowerCase()) ?? 0) || 1
    )

    results.push({
      method: op.method,
      path: op.path,
      functionName: name,
      methodName: name,
    })
  }

  return results
}

function deriveNameFromPath(
  method: string,
  path: string,
  commonPrefix: string
): string {
  // Strip common prefix
  let cleanPath = path
  if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
    cleanPath = '/' + cleanPath.slice(commonPrefix.length)
  }

  const segments = cleanPath.replace(/^\//, '').split('/').filter(Boolean)

  const methodLower = method.toLowerCase()
  const prefix = METHOD_PREFIXES[methodLower] || methodLower

  // Separate param and non-param segments
  const nonParams: string[] = []
  let hasTrailingParam = false

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startsWith('{')) {
      if (i === segments.length - 1) {
        hasTrailingParam = true
      }
    } else {
      nonParams.push(segments[i])
    }
  }

  if (nonParams.length === 0) {
    return prefix
  }

  // For GET with trailing param: singularize the last non-param segment
  // For GET without trailing param: keep plural (list)
  // For POST without trailing param: use prefix (create)
  const parts = nonParams.map((seg, i) => {
    const isLast = i === nonParams.length - 1
    let word = seg

    if (isLast && hasTrailingParam) {
      word = singularize(word)
    }

    // For GET on collection (no trailing param), use "list" prefix instead of "get"
    return toPascalCase(word)
  })

  // For GET on collection, use "list" instead of "get"
  let finalPrefix = prefix
  if (methodLower === 'get' && !hasTrailingParam) {
    finalPrefix = 'list'
  }

  return finalPrefix + parts.join('')
}
