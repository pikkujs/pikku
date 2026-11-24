import { attentionSchedule } from '@pikku/core/attention-func'
import type { AttentionFuncMeta } from '@pikku/core/attention-func'

/** One `export const x = pikkuAttentionFunc({ widget, every, func })` found in a `*.attention.ts` file. */
export type FoundAttentionFunc = {
  file: string
  exportedName: string
  widget: string
  every: string
}

/** A declaration that could not be read, or that names something it must not. */
export type AttentionFuncProblem = { file: string; message: string }

/** The arranged screens of the plugin being built, with the widget ids each pours into its slots. */
export type ArrangedScreenSlots = { id: string; slots: string[] }[]

const DECLARATION =
  /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pikkuAttentionFunc\s*(?:<[^>(]*>)?\s*\(\s*\{/g

/** The text of the config object that starts at `from`, with every nested `{…}`, `[…]` and `(…)` blanked out. */
const topLevel = (source: string, from: number): string => {
  let depth = 0
  let out = ''
  for (let i = from; i < source.length; i++) {
    const char = source[i]!
    if (char === '{' || char === '[' || char === '(') depth++
    else if (char === '}' || char === ']' || char === ')') {
      if (depth === 0) return out
      depth--
    } else if (depth === 0) out += char
  }
  return out
}

/** The source with its comments blanked, so a declaration in a comment is not one. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')

const literal = (object: string, key: string): string | undefined =>
  new RegExp(`(?:^|[\\s,])${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`).exec(
    object
  )?.[2]

/**
 * The attention funcs a `*.attention.ts` file declares. `widget` and `every`
 * must be string literals: they are read from source, so the build can name
 * the widget before anything runs.
 */
export const readAttentionFuncs = (
  file: string,
  source: string
): { found: FoundAttentionFunc[]; problems: AttentionFuncProblem[] } => {
  const found: FoundAttentionFunc[] = []
  const problems: AttentionFuncProblem[] = []
  const code = withoutComments(source)
  for (const match of code.matchAll(DECLARATION)) {
    const exportedName = match[1]!
    const object = topLevel(code, match.index! + match[0].length)
    const widget = literal(object, 'widget')
    const every = literal(object, 'every')
    if (widget === undefined || every === undefined) {
      problems.push({
        file,
        message: `Attention func '${exportedName}' needs a string literal for ${[widget === undefined ? 'widget' : '', every === undefined ? 'every' : ''].filter(Boolean).join(' and ')}: it is read from source.`,
      })
      continue
    }
    found.push({ file, exportedName, widget, every })
  }
  return { found, problems }
}

/**
 * What is wrong with the declarations, as sentences that name the plugin:
 * a widget that is not one of its own arranged screens' slots, two funcs for
 * one widget, an `every` the schedule cannot be built from, and a file that
 * does not end in `.attention.ts`.
 */
export const checkAttentionFuncs = (
  plugin: string,
  found: FoundAttentionFunc[],
  screens: ArrangedScreenSlots
): AttentionFuncProblem[] => {
  const problems: AttentionFuncProblem[] = []
  const seen = new Map<string, FoundAttentionFunc>()
  const declared =
    screens.map((screen) => screen.id).join(', ') || 'none declared'
  for (const attention of found) {
    const { file, widget, every, exportedName } = attention
    if (!file.endsWith('.attention.ts')) {
      problems.push({
        file,
        message: `Attention func '${exportedName}' must live in a *.attention.ts file.`,
      })
    }
    const [screenId, slot] = widget.split('.')
    const screen = screens.find((candidate) => candidate.id === screenId)
    if (!screen) {
      problems.push({
        file,
        message: `Attention func '${exportedName}' names widget '${widget}', but '${screenId}' is not one of ${plugin}'s arranged screens (${declared}).`,
      })
    } else if (!screen.slots.includes(slot ?? '')) {
      problems.push({
        file,
        message: `Attention func '${exportedName}' names widget '${widget}', but screen '${screenId}' of ${plugin} has no slot '${slot}' (slots: ${screen.slots.join(', ') || 'none'}).`,
      })
    }
    try {
      attentionSchedule(widget, every)
    } catch (error) {
      problems.push({ file, message: (error as Error).message })
    }
    const earlier = seen.get(widget)
    if (earlier) {
      problems.push({
        file,
        message: `Attention func '${exportedName}' names widget '${widget}', which '${earlier.exportedName}' already covers.`,
      })
    }
    seen.set(widget, attention)
  }
  return problems
}

/** The metadata the runtime reads: schedule included, so the app never parses a duration. */
export const attentionFuncsMeta = (
  found: FoundAttentionFunc[]
): AttentionFuncMeta =>
  Object.fromEntries(
    [...found]
      .sort((a, b) => a.widget.localeCompare(b.widget))
      .map(({ widget, every, file, exportedName }) => [
        widget,
        {
          widget,
          every,
          schedule: attentionSchedule(widget, every),
          sourceFile: file,
          exportedName,
        },
      ])
  )
