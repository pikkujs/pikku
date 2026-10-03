import { BLOCKS, COMPONENTS } from './registry.gen.js'
import type { Block, ComponentEntry, ResolvedBlock } from './types.js'

export { BLOCKS, COMPONENTS }
export { parseCva } from './cva.js'
export type * from './types.js'

export function findComponent(name: string): ComponentEntry | undefined {
  const wanted = name.toLowerCase()
  return COMPONENTS.find((c) => c.name.toLowerCase() === wanted)
}

export function listComponents(): ComponentEntry[] {
  return COMPONENTS
}

export function resolveComponent(name: string): { component: ComponentEntry; files: Record<string, string>; npmDeps: string[] } | undefined {
  const component = findComponent(name)
  if (!component) return undefined
  const chain: ComponentEntry[] = []
  const seen = new Set<string>()
  const visit = (c: ComponentEntry) => {
    if (seen.has(c.name)) return
    seen.add(c.name)
    chain.push(c)
    for (const dep of c.registryDeps) {
      const found = findComponent(dep)
      if (found) visit(found)
    }
  }
  visit(component)
  const files: Record<string, string> = {}
  const npmDeps = new Set<string>()
  for (const c of chain) {
    for (const [file, content] of Object.entries(c.files)) if (!(file in files)) files[file] = content
    for (const d of c.npmDeps) npmDeps.add(d)
  }
  return { component, files, npmDeps: [...npmDeps].sort() }
}

export function findBlock(name: string): Block | undefined {
  const wanted = name.toLowerCase()
  return BLOCKS.find((b) => b.name.toLowerCase() === wanted)
}

export function listBlocks(tag?: string): Block[] {
  const wanted = tag?.toLowerCase()
  return BLOCKS.filter((b) => !b.internal && (!wanted || b.tags.some((t) => t.toLowerCase() === wanted)))
}

export function blockTags(): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>()
  for (const b of listBlocks()) for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }))
}

export function resolveBlock(name: string): ResolvedBlock | undefined {
  const block = findBlock(name)
  if (!block) return undefined
  const chain: Block[] = []
  const seen = new Set<string>()
  const visit = (b: Block) => {
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
  const components = new Set<string>()
  for (const b of chain) {
    for (const [file, content] of Object.entries(b.source)) if (!(file in files)) files[file] = content
    Object.assign(i18nKeys, b.i18nKeys)
    for (const d of b.npmDeps) npmDeps.add(d)
    for (const c of b.components) components.add(c)
  }
  return { block, composes: chain.slice(1).map((b) => b.name), components: [...components].sort(), files, i18nKeys, npmDeps: [...npmDeps] }
}
