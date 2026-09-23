import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const START = /^\s*(?:\/\/|--)\s*@snippet start (\S+)\s*$/
const END = /^\s*(?:\/\/|--)\s*@snippet end (\S+)\s*$/

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.sql']
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.pikku', 'dist', '.git'])

export class UnclosedSnippetError extends Error {
  constructor(name: string, file: string) {
    super(
      `The snippet "${name}" opens in ${file} and never closes. Add "// @snippet end ${name}".`
    )
    this.name = 'UnclosedSnippetError'
  }
}

export class DuplicateSnippetError extends Error {
  constructor(name: string, file: string, other: string) {
    super(
      `The snippet "${name}" is defined twice, in ${other} and ${file}. Snippet names are the reference an example uses, so they have to be unique.`
    )
    this.name = 'DuplicateSnippetError'
  }
}

export class MissingSnippetError extends Error {
  constructor(name: string, file: string) {
    super(
      `${file} shows the snippet "${name}", which no @snippet region defines. ` +
        `Add "// @snippet start ${name}" to a compiled example project, or fix the fence.`
    )
    this.name = 'MissingSnippetError'
  }
}

const dedent = (lines: string[]): string => {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.length - line.trimStart().length)
  const shortest = indents.length > 0 ? Math.min(...indents) : 0
  return lines
    .map((line) => line.slice(shortest))
    .join('\n')
    .trim()
}

const sourceFilesIn = async (
  directory: string,
  found: string[] = []
): Promise<string[]> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) {
        continue
      }
      await sourceFilesIn(full, found)
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      found.push(full)
    }
  }
  return found
}

/**
 * The `// @snippet start <name>` regions in a project's source, so an example
 * in a doc comment can name one instead of restating it. The same mechanism the
 * website uses to pull its code blocks out of the shop template: the code that
 * reaches the reader is the code that compiles, and it cannot drift.
 */
export const collectSnippets = async (
  projectDir: string,
  into: Map<string, string> = new Map(),
  origins: Map<string, string> = new Map()
): Promise<Map<string, string>> => {
  for (const file of await sourceFilesIn(projectDir)) {
    const where = relative(projectDir, file)
    const lines = (await readFile(file, 'utf8')).split('\n')
    const open = new Map<string, string[]>()
    for (const line of lines) {
      const end = line.match(END)
      if (end?.[1] && open.has(end[1])) {
        const name = end[1]
        const existing = origins.get(name)
        if (existing) throw new DuplicateSnippetError(name, where, existing)
        into.set(name, dedent(open.get(name)!))
        origins.set(name, where)
        open.delete(name)
        continue
      }
      const start = line.match(START)
      if (start?.[1]) {
        if (!open.has(start[1])) open.set(start[1], [])
        continue
      }
      if (end) continue
      for (const body of open.values()) body.push(line)
    }
    const [unclosed] = open.keys()
    if (unclosed) throw new UnclosedSnippetError(unclosed, where)
  }
  return into
}

/**
 * A fence that names a region instead of carrying code:
 *
 * ```ts snippet:definePersonas
 * ```
 *
 * The language is optional and kept. Marked fences are replaced whole — both
 * the placeholder form and a filled-in block, so a skill can be migrated
 * without hand-deleting the old copy.
 */
const SNIPPET_FENCE = /^(\s*)```(\S*)\s+snippet:([A-Za-z0-9_.-]+)\s*$/
const CLOSING_FENCE = /^\s*```\s*$/

export type Snippets = Record<string, string> | Map<string, string>

const replace = (
  markdown: string,
  lookup: (name: string) => string
): string => {
  const lines = markdown.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(SNIPPET_FENCE)
    if (!match) {
      out.push(line)
      continue
    }
    const indent = match[1] ?? ''
    const lang = match[2] ?? ''
    const region = match[3]!
    const body = lookup(region)
    out.push(`${indent}\`\`\`${lang}`)
    for (const bodyLine of body.split('\n')) {
      out.push(bodyLine.length > 0 ? indent + bodyLine : '')
    }
    out.push(`${indent}\`\`\``)
    while (i + 1 < lines.length && !CLOSING_FENCE.test(lines[i + 1]!)) i++
    i++
  }
  return out.join('\n')
}

/** Every region a markdown document shows, in order. */
export const snippetRegionsIn = (markdown: string): string[] =>
  markdown
    .split('\n')
    .map((line) => line.match(SNIPPET_FENCE))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[3]!)

/**
 * A skill's text with every marked fence replaced by its region's code. Used
 * twice, deliberately: `scripts/embed.ts` bakes the result into the manifest
 * that ships inside the CLI binary, and `readSkillFile` applies it to a
 * filesystem copy so an installed package shows the same code the binary does.
 */
export const expandSkillMarkdown = (
  markdown: string,
  snippets: Snippets,
  file = 'skill'
): string => {
  const lookup = (name: string): string => {
    const body = snippets instanceof Map ? snippets.get(name) : snippets[name]
    if (body === undefined) throw new MissingSnippetError(name, file)
    return body
  }
  return replace(markdown, lookup)
}
