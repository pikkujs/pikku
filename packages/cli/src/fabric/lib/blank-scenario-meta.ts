/**
 * Blank the `name`, `description` and `template` values declared directly on a
 * `pikkuFeature` / `pikkuScenario` / `pikkuScenarioStep` object, keeping the
 * source the same length so a later scan still reports real positions.
 *
 * Those three fields are Console meta — authored in the project's `locale`,
 * describing the test to whoever reads the run — and are deliberately not the
 * app's UI copy. The hardcoded-copy check flagged them anyway whenever a
 * feature happened to be named after the screen it covers:
 *
 *   export const downloadsFeature = pikkuFeature({
 *     name: 'Downloads',   → ✗ "Downloads" → nav__downloads | downloads__title
 *
 * and its advice — read the string from the app catalogue — would tie the
 * Console's language to the product's, which is the opposite of what should
 * happen. Complying with the rule that puts features in `*.scenario.ts` was
 * what surfaced them, so the two rules disagreed: satisfying one created
 * violations of the other.
 *
 * Only the top level of the object is blanked. `getByRole('button', { name:
 * 'Speichern' })` nested inside a step is a selector built out of UI copy —
 * exactly what the check exists to catch — and stays visible.
 */
const DECLARATIONS = [
  'pikkuFeature',
  'pikkuScenario',
  'pikkuScenarioStep',
  'pikkuPlatformScenarioStep',
  'pikkuAddonScenarioStep',
]

const META_FIELDS = /^(name|description|template)$/

const QUOTES = new Set(["'", '"', '`'])

/** Index just past the string literal opening at `start`, or -1. */
function endOfString(src: string, start: number): number {
  const quote = src[start]
  let i = start + 1
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2
      continue
    }
    if (src[i] === quote) return i + 1
    i++
  }
  return -1
}

export function blankScenarioMeta(source: string): string {
  const out = source.split('')

  for (const decl of DECLARATIONS) {
    const call = new RegExp(`\\b${decl}\\s*\\(`, 'g')
    let m: RegExpExecArray | null
    while ((m = call.exec(source))) {
      let i = m.index + m[0].length
      while (i < source.length && /\s/.test(source[i]!)) i++
      if (source[i] !== '{') continue

      let depth = 0
      while (i < source.length) {
        const ch = source[i]!

        if (QUOTES.has(ch)) {
          const end = endOfString(source, i)
          if (end === -1) break
          i = end
          continue
        }

        if (ch === '{') {
          depth++
          i++
          continue
        }

        if (ch === '}') {
          depth--
          if (depth === 0) break
          i++
          continue
        }

        if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
          const key = /^[A-Za-z0-9_$]+/.exec(source.slice(i))![0]
          let j = i + key.length
          while (j < source.length && /\s/.test(source[j]!)) j++
          if (source[j] === ':' && META_FIELDS.test(key)) {
            j++
            while (j < source.length && /\s/.test(source[j]!)) j++
            if (QUOTES.has(source[j]!)) {
              const end = endOfString(source, j)
              if (end !== -1) {
                for (let k = j + 1; k < end - 1; k++) {
                  if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '
                }
                i = end
                continue
              }
            }
          }
          i += key.length
          continue
        }

        i++
      }
    }
  }

  return out.join('')
}
