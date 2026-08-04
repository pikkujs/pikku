/**
 * GitHub-style alerts — `> [!NOTE]` and friends — as a mdast transform.
 *
 * The syntax is a blockquote whose first line is a marker, so it stays a
 * blockquote everywhere that doesn't know about it: GitHub draws it as a
 * callout, this console draws it as a callout, and a plain markdown viewer shows
 * an ordinary quote with the marker on top. Nothing is lost by writing one.
 *
 * The kind is carried to the renderer as a class rather than a data attribute
 * because a class survives every layer between here and the DOM unchanged, and
 * the blockquote renderer reads it back with `alertKindOf`.
 */

const ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const

export type AlertKind = (typeof ALERT_KINDS)[number]

const MARKER = /^\[!(note|tip|important|warning|caution)\]\s*/i

const CLASS_PREFIX = 'md-alert-'

/** The kind a transformed blockquote carries, or null for an ordinary quote. */
export const alertKindOf = (
  className: string | undefined
): AlertKind | null => {
  if (!className) return null
  for (const kind of ALERT_KINDS) {
    if (className.split(/\s+/).includes(`${CLASS_PREFIX}${kind}`)) return kind
  }
  return null
}

type MdastNode = {
  type: string
  value?: string
  children?: MdastNode[]
  data?: { hProperties?: Record<string, unknown> }
}

/**
 * Strips the marker off a blockquote's opening paragraph and tags the quote with
 * its kind. Returns false when the quote does not open with a marker, so the
 * caller leaves it alone.
 */
const markAlert = (quote: MdastNode): boolean => {
  const paragraph = quote.children?.[0]
  if (paragraph?.type !== 'paragraph') return false
  const first = paragraph.children?.[0]
  if (first?.type !== 'text' || typeof first.value !== 'string') return false

  const match = MARKER.exec(first.value)
  if (!match) return false

  first.value = first.value.slice(match[0].length)
  // The marker sits on a line of its own, so what follows it is a hard break
  // whose only job was to end that line. Left in place it opens the callout with
  // a blank first line.
  if (first.value === '') {
    const rest = paragraph.children!.slice(1)
    if (rest[0]?.type === 'break') rest.shift()
    paragraph.children = rest
    if (rest.length === 0) quote.children!.shift()
  }

  quote.data = {
    ...quote.data,
    hProperties: {
      ...quote.data?.hProperties,
      className: `${CLASS_PREFIX}${match[1]!.toLowerCase()}`,
    },
  }
  return true
}

/**
 * Walked by hand rather than with `unist-util-visit`: the whole traversal is the
 * four lines below, and the console does not otherwise depend on the unist
 * utilities.
 */
const walk = (node: MdastNode) => {
  for (const child of node.children ?? []) {
    if (child.type === 'blockquote') markAlert(child)
    walk(child)
  }
}

export const remarkAlerts = () => (tree: MdastNode) => {
  walk(tree)
}
