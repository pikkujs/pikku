export type SuggestedSecurity = 'pii' | 'secret'

export interface SensitiveNameSuggestion {
  security: SuggestedSecurity
  /** For a secret: 'hashed' when the name says it is a digest, else a value read back. */
  formHint?: 'hashed' | 'readBack'
}

/** Tokens that make a name a statement ABOUT a credential rather than the credential. */
const NON_VALUE_LAST = new Set([
  'at',
  'count',
  'id',
  'ids',
  'type',
  'ref',
  'verified',
  'set',
  'changed',
  'expires',
  'expiry',
  'length',
])
const NON_VALUE_FIRST = new Set(['is', 'has', 'can', 'should', 'needs'])

const SKIPPED_TYPE =
  /^(tinyint|smallint|mediumint|bigint|int\d*|integer|serial|bigserial|smallserial|bool|boolean|bit|date|datetime|timestamp|timestamptz|time|timetz|real|float\d*|double|numeric|decimal|money)\b/i

const SECRET_TOKENS = new Set([
  'password',
  'passwd',
  'passphrase',
  'secret',
  'credential',
  'credentials',
  'apikey',
  'privatekey',
  'token',
])
const SECRET_PAIRS = [
  ['api', 'key'],
  ['private', 'key'],
  ['signing', 'key'],
]

const PII_TOKENS = new Set([
  'email',
  'phone',
  'firstname',
  'lastname',
  'fullname',
  'address',
  'dob',
  'ssn',
  'ip',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'birthday',
])
const PII_PAIRS = [
  ['first', 'name'],
  ['last', 'name'],
  ['full', 'name'],
  ['birth', 'date'],
]

/**
 * Tables whose bare `name` column is a person's name. Matched against the last
 * token of the table name (singularised), plus the `account holder` pair.
 */
const PERSON_TABLES = new Set([
  'user',
  'person',
  'customer',
  'member',
  'contact',
  'profile',
  'employee',
])

/** Split snake_case, kebab-case and camelCase into lowercase whole tokens. */
export function tokenise(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const hasPair = (tokens: string[], pairs: string[][]): boolean =>
  pairs.some(([a, b]) => tokens.some((t, i) => t === a && tokens[i + 1] === b))

const isPersonTable = (table: string): boolean => {
  const tokens = tokenise(table)
  const last = tokens[tokens.length - 1]?.replace(/s$/, '')
  if (last && PERSON_TABLES.has(last)) return true
  const n = tokens.length
  return n >= 2 && tokens[n - 2] === 'account' && last === 'holder'
}

/**
 * Whether a column name looks like personal data or a credential. Whole-token
 * matching on the tokenised name, so `zip`/`description` never match `ip`.
 * Pure: annotation and framework-table decisions belong to the caller.
 */
export function suggestSecurityForColumn(
  table: string,
  column: string,
  sqlType: string
): SensitiveNameSuggestion | null {
  if (SKIPPED_TYPE.test(sqlType.trim())) return null
  const tokens = tokenise(column)
  if (tokens.length === 0) return null
  if (NON_VALUE_LAST.has(tokens[tokens.length - 1]!) && tokens.length > 1)
    return null
  if (NON_VALUE_FIRST.has(tokens[0]!)) return null

  const namesASecret = tokens.length > 1 && tokens[tokens.length - 1] === 'name'
  if (
    !namesASecret &&
    (tokens.some((t) => SECRET_TOKENS.has(t)) || hasPair(tokens, SECRET_PAIRS))
  ) {
    const hashed = tokens.includes('hash') || tokens.includes('digest')
    return { security: 'secret', formHint: hashed ? 'hashed' : 'readBack' }
  }
  if (tokens.some((t) => PII_TOKENS.has(t)) || hasPair(tokens, PII_PAIRS)) {
    return { security: 'pii' }
  }
  if (tokens.length === 1 && tokens[0] === 'name' && isPersonTable(table)) {
    return { security: 'pii' }
  }
  return null
}
