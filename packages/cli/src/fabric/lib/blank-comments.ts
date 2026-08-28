/**
 * Replace every comment in a TypeScript/JavaScript source with spaces, keeping
 * the string exactly as long and every newline where it was, so offsets and
 * line numbers computed against the result still point at the real file.
 *
 * The checks that scan source text with a regex have to run over this first.
 * Scanning raw text made prose executable: a sentence reading
 *
 *   // what separates "needs you" from "is fine" at a glance
 *
 * matched an import-specifier pattern and reported `is fine` as an undeclared
 * dependency. Quotes are tracked rather than blanked, because the specifier a
 * caller is looking for lives inside them.
 *
 * A regex literal holding `//` or an unpaired quote is not modelled — telling
 * `/` as division from `/` as a regex needs the parser this deliberately is
 * not. The failure mode is a blanked region, never a comment left readable.
 */
export function blankComments(source: string): string {
  const out = source.split('')
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end && i < out.length; i++) {
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' '
    }
  }

  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      blank(i, end === -1 ? source.length : end)
      i = end === -1 ? source.length : end
      continue
    }

    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2)
      const end = close === -1 ? source.length : close + 2
      blank(i, end)
      i = end
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === ch) {
          i++
          break
        }
        i++
      }
      continue
    }

    i++
  }

  return out.join('')
}

/** 1-based line number of a character offset. */
export function lineOfOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}
