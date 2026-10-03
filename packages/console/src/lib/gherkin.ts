/**
 * The ```gherkin fence, split into the two things a reader is actually scanning
 * for: the step keyword, and who is acting.
 *
 * A slice's scenario is the part of the note that says what "done" means, and as
 * a plain code block it reads as a wall of monospace where the shape — three
 * Givens, one When, two Thens — is the information. Highlighting it as source
 * does not help either: `Given` is not a language keyword and a highlighter
 * colours the quotes rather than the persona inside them.
 *
 * A quoted word means a persona (the skill rejects `Given I have no entry` for
 * exactly this reason: first person hides who is acting), so it is drawn as one.
 * That makes a first-person scenario visibly different from a correct one —
 * a wall of grey with no chips in it — which is a review the eye can do.
 */

export type GherkinToken = {
  type: 'text' | 'persona'
  value: string
}

export type GherkinLine = {
  /** `Given`, `When`, … in the author's own casing, or null for prose. */
  keyword: string | null
  /** True for the structural keywords, which head a block rather than a step. */
  heading: boolean
  tokens: GherkinToken[]
}

/**
 * Step keywords and block headings. `Scenario Outline` before `Scenario` so the
 * longer one is not shadowed by its own prefix.
 */
const HEADINGS = [
  'Scenario Outline',
  'Scenario Template',
  'Scenario',
  'Background',
  'Feature',
  'Rule',
  'Example',
  'Examples',
] as const

const STEPS = ['Given', 'When', 'Then', 'And', 'But', '*'] as const

const PERSONA = /'([^']+)'|"([^"]+)"/g

/**
 * A step's words, with quoted personas lifted out. The quotes are dropped: they
 * are the syntax that marks the persona, and the chip is what they become.
 */
const tokenize = (text: string): GherkinToken[] => {
  const tokens: GherkinToken[] = []
  let last = 0
  for (const match of text.matchAll(PERSONA)) {
    const persona = match[1] ?? match[2]!
    if (match.index > last) {
      tokens.push({ type: 'text', value: text.slice(last, match.index) })
    }
    tokens.push({ type: 'persona', value: persona })
    last = match.index + match[0].length
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}

const keywordAt = (
  line: string,
  candidates: readonly string[]
): string | null => {
  for (const candidate of candidates) {
    if (!line.toLowerCase().startsWith(candidate.toLowerCase())) continue
    const rest = line.slice(candidate.length)
    // A keyword is a whole word — a step beginning "Whenever" is prose, and
    // `Scenario:` keeps its colon out of the label.
    if (rest === '' || /^[\s:]/.test(rest)) return candidate
  }
  return null
}

/** The lines of a gherkin fence, in order, blank lines included as empty prose. */
export const parseGherkin = (source: string): GherkinLine[] =>
  source.split(/\r?\n/).map((raw) => {
    const line = raw.trim()
    const heading = keywordAt(line, HEADINGS)
    if (heading) {
      return {
        keyword: heading,
        heading: true,
        tokens: tokenize(line.slice(heading.length).replace(/^:\s*/, '')),
      }
    }
    const step = keywordAt(line, STEPS)
    if (step) {
      return {
        keyword: step,
        heading: false,
        tokens: tokenize(line.slice(step.length).trimStart()),
      }
    }
    return { keyword: null, heading: false, tokens: tokenize(line) }
  })
