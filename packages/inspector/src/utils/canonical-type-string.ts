/**
 * A printed type with the members of every union in it sorted: by text, with
 * `null` and `undefined` last. The checker prints a union in the order its
 * members were created, which follows whichever file it happened to check
 * first, and so differs between runtimes and between the TypeScript and native
 * inspectors. Everything other than a union's order is left byte for byte.
 *
 * A level the scanner cannot split safely (a conditional type, a type
 * parameter's constraint, a type predicate) keeps its order and only has the
 * brackets inside it canonicalized. The native inspector's
 * `typesmap.CanonicalTypeString` is the same algorithm, and both run the cases
 * in `canonical-type-string.cases.json`.
 */
export const canonicalTypeString = (type: string): string => {
  const lead = type.length - type.replace(/^[ \t\n\r]+/, '').length
  const trail = type.length - type.replace(/[ \t\n\r]+$/, '').length
  if (lead === type.length) return type
  const body = type.slice(lead, type.length - trail)
  return (
    type.slice(0, lead) + canonicalBody(body) + type.slice(type.length - trail)
  )
}

const OPENERS = '{[(<'
const CLOSE: Record<string, string> = { '{': '}', '[': ']', '(': ')', '<': '>' }
const CLOSERS = '}])>'
const QUOTES = `"'\``
const UNSPLITTABLE = new Set(['extends', 'is', 'asserts', 'infer', 'as'])
const MAPPED_KEY = /^[A-Za-z_$][\w$]*[ \t\n\r]+in[ \t\n\r]/

/** Where the comment starting at `i` ends (exclusive), or -1 if none starts there. */
const commentEnd = (s: string, i: number): number => {
  if (s[i] !== '/') return -1
  if (s[i + 1] === '*') {
    const end = s.indexOf('*/', i + 2)
    return end === -1 ? s.length : end + 2
  }
  if (s[i + 1] === '/') {
    const end = s.indexOf('\n', i + 2)
    return end === -1 ? s.length : end
  }
  return -1
}

/**
 * `s` with everything inside brackets, string literals and comments blanked,
 * and the outermost bracket pairs.
 */
const topLevel = (s: string) => {
  const mask = Array.from({ length: s.length }, () => ' ')
  const groups: Array<[number, number]> = []
  let depth = 0
  let open = -1
  for (let i = 0; i < s.length; i++) {
    const char = s[i]
    if (QUOTES.includes(char)) {
      let j = i + 1
      while (j < s.length && s[j] !== char) j += s[j] === '\\' ? 2 : 1
      i = j
      continue
    }
    const end = commentEnd(s, i)
    if (end !== -1) {
      i = end - 1
      continue
    }
    if (OPENERS.includes(char)) {
      if (depth === 0) open = i
      depth++
    } else if (CLOSERS.includes(char) && !(char === '>' && s[i - 1] === '=')) {
      if (depth > 0) depth--
      if (depth === 0 && open !== -1 && CLOSE[s[open]] === char) {
        groups.push([open, i])
        open = -1
      }
    } else if (depth === 0) {
      mask[i] = char
    }
  }
  return { mask: mask.join(''), groups }
}

const isNullish = (member: string) =>
  member === 'null' || member === 'undefined'

const sortMembers = (members: string[]) =>
  members.sort((a, b) =>
    isNullish(a) !== isNullish(b)
      ? isNullish(a)
        ? 1
        : -1
      : a < b
        ? -1
        : a > b
          ? 1
          : 0
  )

const unsplittable = (mask: string): boolean => {
  if (/[?:]/.test(mask)) return true
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === '=' && mask[i + 1] !== '>') return true
  }
  return mask.split(/[^A-Za-z0-9_$]+/).some((word) => UNSPLITTABLE.has(word))
}

const canonicalBody = (body: string): string => {
  const { mask } = topLevel(body)
  const arrow = mask.indexOf('=>')
  if (arrow !== -1 && !mask.slice(0, arrow).includes('|')) {
    return `${rewriteGroups(body.slice(0, arrow))}=>${canonicalTypeString(body.slice(arrow + 2))}`
  }
  const mapped = MAPPED_KEY.exec(mask)
  if (mapped) {
    const key = mapped[0].length
    return body.slice(0, key) + canonicalTypeString(body.slice(key))
  }
  if (!mask.includes('|') || unsplittable(mask)) return rewriteGroups(body)
  const members: string[] = []
  let start = 0
  for (let i = 0; i <= mask.length; i++) {
    if (i === mask.length || mask[i] === '|') {
      const member = canonicalTypeString(body.slice(start, i)).trim()
      if (member) members.push(member)
      start = i + 1
    }
  }
  return members.length > 1
    ? sortMembers(members).join(' | ')
    : rewriteGroups(body)
}

/** `s` with the contents of each outermost bracket pair canonicalized. */
const rewriteGroups = (s: string): string => {
  let out = ''
  let last = 0
  for (const [open, close] of topLevel(s).groups) {
    out +=
      s.slice(last, open + 1) + rewriteList(s.slice(open + 1, close), s[open])
    last = close
  }
  return out + s.slice(last)
}

/** A bracket's contents: members of an object, parameters, or type arguments. */
const rewriteList = (inner: string, opener: string): string => {
  const separators = opener === '{' ? ';,' : ','
  const { mask } = topLevel(inner)
  let out = ''
  let start = 0
  for (let i = 0; i <= mask.length; i++) {
    if (i === mask.length || separators.includes(mask[i])) {
      out += rewriteItem(inner.slice(start, i), opener) + (inner[i] ?? '')
      start = i + 1
    }
  }
  return out
}

const rewriteItem = (item: string, opener: string): string => {
  if (opener === '<') return canonicalTypeString(item)
  const colon = topLevel(item).mask.indexOf(':')
  if (colon === -1) return canonicalTypeString(item)
  return `${rewriteGroups(item.slice(0, colon))}:${canonicalTypeString(item.slice(colon + 1))}`
}
