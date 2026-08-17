export type SurfaceDocBlock =
  { kind: 'prose'; text: string } | { kind: 'code'; text: string }

/**
 * A doc comment as the panel should read it. The source is wrapped to whatever
 * column its author's editor used, so a paragraph's own line breaks are an
 * artefact and get reflowed, while blank lines and fenced examples are what the
 * author meant and are kept as written.
 */
export const docBlocks = (docs: string): SurfaceDocBlock[] => {
  const blocks: SurfaceDocBlock[] = []
  const segments = docs.split(/```[^\n]*\n?/)

  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      const text = segment.replace(/\n$/, '')
      if (text.trim()) blocks.push({ kind: 'code', text })
      return
    }
    for (const paragraph of segment.split(/\n\s*\n/)) {
      const text = paragraph.replace(/\s*\n\s*/g, ' ').trim()
      if (text) blocks.push({ kind: 'prose', text })
    }
  })

  return blocks
}
