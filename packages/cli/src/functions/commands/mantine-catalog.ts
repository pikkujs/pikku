import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { MantineCatalog } from '@pikku/code-edit/mantine'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'
import { pikkuSessionlessFunc } from '#pikku/function'

const catalog = (rootDir: string) =>
  new MantineCatalog(findWorkspaceRoot(rootDir))

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
          `No metadata for ${name} in the installed Mantine; see \`pikku components list\``
        )
      }
      const { props: _flat, ...rest } = meta
      print({ name, ...rest })
    },
  }
)

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
    const { block, composes, files, i18nKeys, npmDeps } = resolved
    const summary = {
      name: block.name,
      title: block.title,
      description: block.description,
      composes,
      i18nKeys,
      npmDeps,
      usage: block.usage,
    }
    if (!out) {
      print({ ...summary, files })
      return
    }
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
    print({ ...summary, wrote, skipped })
  },
})
