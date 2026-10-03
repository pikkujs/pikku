import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ShadcnCatalog } from '@pikku/code-edit/shadcn'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'
import { pikkuSessionlessFunc } from '#pikku/function'

const catalog = (rootDir: string) =>
  new ShadcnCatalog(findWorkspaceRoot(rootDir))

const print = (value: unknown) =>
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

export const pikkuComponentsList = pikkuSessionlessFunc<null, void>({
  func: async ({ config }) => {
    print(await catalog(config.rootDir).componentNames())
  },
})

export const pikkuComponentsShow = pikkuSessionlessFunc<{ name: string }, void>(
  {
    func: async ({ config }, { name }) => {
      const meta = await catalog(config.rootDir).componentMeta(name)
      if (meta.source === 'none') {
        throw new Error(
          `No component ${name} in the app's src/components/ui; see \`pikku components list\``
        )
      }
      print({ name, ...meta })
    },
  }
)

export const pikkuComponentsAdd = pikkuSessionlessFunc<
  { names: string },
  void
>({
  func: async ({ config }, { names }) => {
    const wanted = names.split(/[\s,]+/).filter(Boolean)
    const result = await catalog(config.rootDir).installComponents(wanted)
    if (result.unknown.length) {
      const all = (await catalog(config.rootDir).blocks()).listComponents()
      throw new Error(
        `No shadcdn component named ${result.unknown.join(', ')}; available: ${all.map((c) => c.name).join(', ')}`
      )
    }
    print(result)
  },
})

export const pikkuBlocksList = pikkuSessionlessFunc<{ tag?: string }, void>({
  func: async ({ config }, { tag }) => {
    const { blockTags, listBlocks } = await catalog(config.rootDir).blocks()
    const blocks = listBlocks(tag)
    if (tag && !blocks.length) {
      throw new Error(
        `No blocks tagged ${tag}; tags: ${blockTags()
          .map((t) => t.tag)
          .join(', ')}`
      )
    }
    print({
      tags: tag ? undefined : blockTags(),
      blocks: blocks.map(({ name, title, description, tags }) => ({
        name,
        title,
        description,
        tags,
      })),
    })
  },
})

export const pikkuBlocksShow = pikkuSessionlessFunc<
  { name: string; out?: string },
  void
>({
  func: async ({ config }, { name, out }) => {
    const resolved = (await catalog(config.rootDir).blocks()).resolveBlock(name)
    if (!resolved)
      throw new Error(`No block named ${name}; see \`pikku blocks list\``)
    const { block, composes, components, files, i18nKeys, npmDeps } = resolved
    const cat = catalog(config.rootDir)
    const have = await cat.installedComponentFiles()
    const missingComponents = components.filter((c) => !have.has(c))
    const summary = {
      name: block.name,
      title: block.title,
      description: block.description,
      composes,
      components,
      missingComponents,
      i18nKeys,
      npmDeps,
      usage: block.usage,
    }
    if (!out) {
      print({ ...summary, files })
      return
    }
    const installedComponents = missingComponents.length
      ? await cat.installComponents(missingComponents)
      : undefined
    const dir = resolve(process.cwd(), out)
    await mkdir(dir, { recursive: true })
    const wrote: string[] = []
    const skipped: string[] = []
    for (const [file, content] of Object.entries(files)) {
      const path = join(dir, file)
      if (existsSync(path)) {
        skipped.push(path)
        continue
      }
      await writeFile(path, content, 'utf-8')
      wrote.push(path)
    }
    const messages = await cat.addMessages(i18nKeys)
    print({
      ...summary,
      messagesAdded: messages.added.length ? { file: messages.file, keys: messages.added } : undefined,
      wrote,
      skipped,
      installedComponents: installedComponents?.wrote,
      npmDeps: [...new Set([...npmDeps, ...(installedComponents?.npmDeps ?? [])])],
    })
  },
})
