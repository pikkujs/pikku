/**
 * Normalizers an allow-list entry can name. Each is applied to both engines'
 * copy of a section before they are compared, so it can only hide a
 * difference that is the same after normalization on both sides.
 */

const OPENERS: Record<string, string> = {
  '{': '}',
  '[': ']',
  '(': ')',
  '<': '>',
}
const CLOSERS = new Set(Object.values(OPENERS))

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
 * Calls `visit` for every character outside string literals and comments,
 * with its bracket depth.
 */
const scan = (
  s: string,
  visit: (char: string, index: number, depth: number) => void
) => {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const char = s[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = null
      continue
    }
    const end = commentEnd(s, i)
    if (end !== -1) {
      i = end - 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '>' && s[i - 1] === '=') {
      visit(char, i, depth)
      continue
    }
    if (char in OPENERS) {
      visit(char, i, depth)
      depth++
    } else if (CLOSERS.has(char)) {
      depth--
      visit(char, i, depth)
    } else {
      visit(char, i, depth)
    }
  }
}

const splitTop = (s: string, separators: string): string[] => {
  const parts: string[] = []
  let start = 0
  scan(s, (char, index, depth) => {
    if (depth === 0 && separators.includes(char)) {
      parts.push(s.slice(start, index))
      start = index + 1
    }
  })
  parts.push(s.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

const matchingClose = (s: string, open: number): number => {
  let found = -1
  let depth0: number | null = null
  scan(s, (char, index, depth) => {
    if (found !== -1) return
    if (index === open) depth0 = depth
    else if (depth0 !== null && CLOSERS.has(char) && depth === depth0) {
      found = index
    }
  })
  return found
}

type Order = 1 | -1

const ordered = (items: string[], order: Order) =>
  items.sort((a, b) => (a < b ? -order : a > b ? order : 0))

const normalizeMember = (member: string, order: Order): string => {
  let colon = -1
  scan(member, (char, index, depth) => {
    if (colon === -1 && depth === 0 && char === ':') colon = index
  })
  if (colon === -1) return rewriteGroups(member, order)
  return `${member.slice(0, colon).trim()}: ${reorderTypeString(member.slice(colon + 1), order)}`
}

const rewriteGroups = (s: string, order: Order): string => {
  let out = ''
  let i = 0
  while (i < s.length) {
    const char = s[i]
    if (char in OPENERS && !(char === '<' && s[i - 1] === '=')) {
      const close = matchingClose(s, i)
      if (close === -1) return out + s.slice(i)
      const inner = s.slice(i + 1, close)
      out +=
        char === '{'
          ? reorderTypeString(s.slice(i, close + 1), order)
          : `${char}${splitTop(inner, ',')
              .map((part) => reorderTypeString(part, order))
              .join(', ')}${OPENERS[char]}`
      i = close + 1
    } else if (char === '"' || char === "'" || char === '`') {
      let j = i + 1
      while (j < s.length && s[j] !== char) j += s[j] === '\\' ? 2 : 1
      out += s.slice(i, j + 1)
      i = j + 1
    } else if (commentEnd(s, i) !== -1) {
      const end = commentEnd(s, i)
      out += s.slice(i, end)
      i = end
    } else {
      out += char
      i++
    }
  }
  return out
}

/** Whitespace runs outside string literals collapsed to one space. */
const collapseWhitespace = (s: string): string => {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const char = s[i]
    if (quote) {
      out += char
      if (char === '\\') out += s[++i] ?? ''
      else if (char === quote) quote = null
    } else if (commentEnd(s, i) !== -1) {
      const end = commentEnd(s, i)
      const comment = s.slice(i, end).replace(/\s+/g, ' ').trim()
      // A line comment would swallow what follows once newlines collapse.
      out += comment.startsWith('//') ? `/*${comment.slice(2)} */` : comment
      i = end - 1
    } else if (/\s/.test(char)) {
      if (!out.endsWith(' ')) out += ' '
    } else {
      if (char === '"' || char === "'" || char === '`') quote = char
      out += char
    }
  }
  return out
}

/**
 * A printed type with every union's members and every object literal's
 * members (comments travel with the member they precede) in `order`.
 */
export const reorderTypeString = (type: string, order: Order): string => {
  const s = type.trim().replace(/^\|\s*/, '')
  // A top-level arrow makes the whole thing a function type: its return
  // type extends to the end, unions included.
  let arrow = -1
  scan(s, (char, index, depth) => {
    if (arrow === -1 && depth === 0 && char === '>' && s[index - 1] === '=') {
      arrow = index - 1
    }
  })
  if (arrow !== -1) {
    return `${rewriteGroups(s.slice(0, arrow).trim(), order)} => ${reorderTypeString(s.slice(arrow + 2), order)}`
  }
  const union = splitTop(s, '|')
  if (union.length > 1) {
    return ordered(
      union.map((member) => reorderTypeString(member, order)),
      order
    ).join(' | ')
  }
  if (s.startsWith('{') && matchingClose(s, 0) === s.length - 1) {
    const members = splitTop(s.slice(1, -1), ';,').map((member) =>
      normalizeMember(member, order)
    )
    return members.length ? `{ ${ordered(members, order).join('; ')} }` : '{}'
  }
  return rewriteGroups(s, order)
}

/**
 * A printed TypeScript type with whitespace collapsed and every union's
 * members and every object literal's properties sorted. tsgo prints
 * string-literal unions and object properties in a different order from
 * Strada; the type is the same.
 */
export const sortTypeString = (type: string): string =>
  reorderTypeString(collapseWhitespace(type), 1)

type Normalizer = (section: unknown) => unknown

/**
 * `functions.typesMap.customTypes[*].type` through `sortTypeString`. Handles
 * both shapes: the serialized pre-finalize state (an entries array) and the
 * comparable post-finalize state (a tagged map).
 */
const sortCustomTypeStrings: Normalizer = (section) => {
  const functions = structuredClone(section) as any
  const customTypes = functions?.typesMap?.customTypes
  const entries: Array<[string, { type: string }]> | undefined = Array.isArray(
    customTypes
  )
    ? customTypes
    : customTypes?.__map
  for (const entry of entries ?? []) {
    if (typeof entry[1]?.type === 'string') {
      entry[1] = { ...entry[1], type: sortTypeString(entry[1].type) }
    }
  }
  return functions
}

export const NORMALIZERS: Record<string, Normalizer> = {
  'sort-custom-type-strings': sortCustomTypeStrings,
}
