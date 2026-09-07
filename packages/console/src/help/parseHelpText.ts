export interface HelpSegment {
  text: string
  anchor?: string
}

const ANCHOR = /\[([^[\]]+)\]\(#([A-Za-z0-9_-]+)\)/g

/**
 * Total by construction: anything that is not an exact `[label](#anchor)` match
 * falls through as literal text, so a typo in hand-written copy renders as a
 * sentence rather than an error.
 */
export function parseHelpText(input: string): HelpSegment[] {
  const out: HelpSegment[] = []
  let last = 0
  ANCHOR.lastIndex = 0
  let match = ANCHOR.exec(input)
  while (match) {
    if (match.index > last) out.push({ text: input.slice(last, match.index) })
    out.push({ text: match[1]!, anchor: match[2]! })
    last = match.index + match[0].length
    match = ANCHOR.exec(input)
  }
  if (last < input.length) out.push({ text: input.slice(last) })
  return out
}
