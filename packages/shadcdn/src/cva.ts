export type CvaDefinition = {
  variants: Record<string, string[]>
  defaultVariants: Record<string, string>
}

function matching(source: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
  const stack: string[] = []
  let quote: string | undefined
  for (let i = open; i < source.length; i++) {
    const char = source[i]!
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char in pairs) stack.push(pairs[char]!)
    else if (char === stack[stack.length - 1]) {
      stack.pop()
      if (!stack.length) return i
    }
  }
  return -1
}

function topLevelKeys(body: string): Array<{ key: string; start: number }> {
  const keys: Array<{ key: string; start: number }> = []
  let depth = 0
  let quote: string | undefined
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      if (depth === 0) {
        const end = body.indexOf(char, i + 1)
        const after = body.slice(end + 1).match(/^\s*:/)
        if (after) {
          keys.push({ key: body.slice(i + 1, end), start: end + 1 + after[0].length })
          i = end + after[0].length
          continue
        }
      }
      quote = char
    } else if ('{(['.includes(char)) depth++
    else if ('})]'.includes(char)) depth--
    else if (depth === 0 && /[A-Za-z_$]/.test(char) && !/[A-Za-z0-9_$]/.test(body[i - 1] ?? ' ')) {
      const match = body.slice(i).match(/^([A-Za-z_$][\w$]*)\s*:/)
      if (match) {
        keys.push({ key: match[1]!, start: i + match[0].length })
        i += match[0].length - 1
      }
    }
  }
  return keys
}

function objectAfter(source: string, from: number): string | undefined {
  let quote: string | undefined
  let open = -1
  for (let i = from; i < source.length; i++) {
    const char = source[i]!
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '{') {
      open = i
      break
    }
  }
  if (open === -1) return undefined
  const close = matching(source, open)
  return close === -1 ? undefined : source.slice(open + 1, close)
}

export function parseCva(source: string): CvaDefinition | undefined {
  const call = source.indexOf('cva(')
  if (call === -1) return undefined
  const close = matching(source, call + 3)
  const args = source.slice(call + 4, close === -1 ? undefined : close)
  const options = objectAfter(args, 0)
  if (!options) return undefined
  const result: CvaDefinition = { variants: {}, defaultVariants: {} }
  const groups = topLevelKeys(options)
  const variantsAt = groups.find((g) => g.key === 'variants')
  if (variantsAt) {
    const body = objectAfter(options, variantsAt.start)
    if (body) {
      for (const group of topLevelKeys(body)) {
        const inner = objectAfter(body, group.start)
        if (inner) result.variants[group.key] = topLevelKeys(inner).map((o) => o.key)
      }
    }
  }
  const defaultsAt = groups.find((g) => g.key === 'defaultVariants')
  if (defaultsAt) {
    const body = objectAfter(options, defaultsAt.start)
    if (body) {
      for (const [, key, value] of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*['"]([^'"]+)['"]/g)) {
        result.defaultVariants[key!] = value!
      }
    }
  }
  return result
}
