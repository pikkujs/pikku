import { MANTINE_BLOCKS } from './blocks.gen.js'
import type { MantineBlock, ResolvedMantineBlock } from './types.js'

export { MANTINE_BLOCKS }
export type * from './types.js'

/** A block by name, case-insensitively. */
export function findBlock(name: string): MantineBlock | undefined {
  const wanted = name.toLowerCase()
  return MANTINE_BLOCKS.find((b) => b.name.toLowerCase() === wanted)
}

/** The blocks an app picks directly, optionally only those carrying a tag. */
export function listBlocks(tag?: string): MantineBlock[] {
  const wanted = tag?.toLowerCase()
  return MANTINE_BLOCKS.filter(
    (b) =>
      !b.internal && (!wanted || b.tags.some((t) => t.toLowerCase() === wanted))
  )
}

/** Each tag with the number of pickable blocks carrying it, sorted by tag. */
export function blockTags(): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const b of listBlocks())
    for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }))
}

/** A block plus everything it composes, transitively, merged into one flat folder of files. */
export function resolveBlock(name: string): ResolvedMantineBlock | undefined {
  const block = findBlock(name)
  if (!block) return undefined
  const chain: MantineBlock[] = []
  const seen = new Set<string>()
  const visit = (b: MantineBlock) => {
    if (seen.has(b.name)) return
    seen.add(b.name)
    chain.push(b)
    for (const dep of b.dependsOn) {
      const found = findBlock(dep)
      if (found) visit(found)
    }
  }
  visit(block)
  const files: Record<string, string> = {}
  const i18nKeys: Record<string, string> = {}
  const npmDeps = new Set<string>()
  for (const b of chain) {
    for (const [file, content] of Object.entries(b.source)) {
      if (!(file in files)) files[file] = content
    }
    Object.assign(i18nKeys, b.i18nKeys)
    for (const d of b.npmDeps) npmDeps.add(d)
  }
  return {
    block,
    composes: chain.slice(1).map((b) => b.name),
    files,
    i18nKeys,
    npmDeps: [...npmDeps],
  }
}
