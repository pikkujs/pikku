/**
 * The ```decision fence — a decision note's answer, in the shape the section
 * promises.
 *
 * `decisions/` answers "what was chosen, and what does that rule out?", and the
 * second half is the half that gets dropped: a note says what was picked and
 * moves on, so the alternative that was considered and rejected is lost and the
 * next reader re-litigates it. A fence makes the omission visible — to the
 * reader, because the card has a gap in it, and to `pikku knowledge validate`,
 * which can see a decision note that never says what it closes off.
 *
 * It is a summary, not the note: prose continues underneath it, and the nuance
 * that does not fit three fields belongs there.
 *
 * Deliberately parsed by hand rather than with a YAML dependency, for the same
 * reason `parseNote` is: the grammar is three keys and a list, and the console
 * bundle should not carry a parser for a language nobody is writing here.
 *
 * Mirrors `parseDecisionFence` in @pikku/knowledge, which is a node module the
 * console cannot import — the same hand-kept arrangement as `RESOURCE_PREFIXES`.
 * Keep the grammar in step: `pikku knowledge validate` warns about the fences
 * this draws, and a note that validates clean must not render as a code block.
 */

export type Decision = {
  /** What was chosen. */
  chosen: string
  /** What choosing it closes off — each entry one rejected alternative. */
  rulesOut: string[]
  /** Why, in the terms the decision was actually argued in. */
  because?: string
}

/**
 * Read in every spelling an LLM writes the key in, because the alternative is a
 * note that renders as an empty card and an author who cannot see why. The
 * canonical form is the kebab one, which is what the skill documents.
 */
const KEYS: Record<string, keyof Decision> = {
  chosen: 'chosen',
  'rules-out': 'rulesOut',
  rules_out: 'rulesOut',
  rulesout: 'rulesOut',
  because: 'because',
}

const KEY_LINE = /^([A-Za-z_-]+):\s*(.*)$/
const LIST_ITEM = /^\s*-\s+/

/**
 * An indented line under a key is the rest of that key's value.
 *
 * `because:` is a sentence, and a sentence wraps — the skill's own example wraps
 * it. Reading only the key line silently truncated the rationale at whatever
 * column the author's editor happened to break on. A key always sits at column
 * zero, so indentation says "still the value above" unambiguously.
 */
const CONTINUATION = /^\s+\S/

const unquote = (value: string): string =>
  value.trim().replace(/^["']|["']$/g, '')

/**
 * The decision a fence body states, or null when it states none.
 *
 * Null rather than a partial: a fence with no `chosen:` is not a decision that
 * is missing a field, it is prose that happens to sit in a fence, and drawing a
 * card around it would assert a structure the author never wrote. The renderer
 * falls back to showing it as code, which is what it is.
 */
export const parseDecisionFence = (source: string): Decision | null => {
  const lines = source.split(/\r?\n/)
  let chosen: string | undefined
  const rulesOut: string[] = []
  let because: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i]!)
    if (!match) continue
    const key = KEYS[match[1]!.toLowerCase()]
    if (!key) continue

    /** This key's value, plus the wrapped lines underneath it. */
    const value = (raw: string): string => {
      let text = raw
      while (
        i + 1 < lines.length &&
        CONTINUATION.test(lines[i + 1]!) &&
        !LIST_ITEM.test(lines[i + 1]!)
      ) {
        text += ` ${lines[++i]!.trim()}`
      }
      return unquote(text)
    }

    if (key === 'rulesOut') {
      // Both shapes, because a decision rules out one thing about as often as
      // several and the author should not have to know which one the parser
      // wants: `rules-out: a thing`, or the key alone above a `- item` block.
      const inline = value(match[2]!)
      if (inline) rulesOut.push(inline)
      while (i + 1 < lines.length && LIST_ITEM.test(lines[i + 1]!)) {
        const item = value(lines[++i]!.replace(LIST_ITEM, ''))
        if (item) rulesOut.push(item)
      }
      continue
    }

    const text = value(match[2]!)
    if (!text) continue
    if (key === 'chosen') chosen ??= text
    else because ??= text
  }

  if (!chosen) return null
  return because ? { chosen, rulesOut, because } : { chosen, rulesOut }
}
