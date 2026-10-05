import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readJsxLiteralText } from '@pikku/inspector'
import type { ValidateFinding } from './persona-checks.js'

const isBlock = (name: string) =>
  name.endsWith('.tsx') &&
  !name.endsWith('.stories.tsx') &&
  !name.endsWith('.test.tsx')

const DEFAULT_BLOCKS_DIR = 'src/blocks'

/**
 * The directory a package declares as its block library, or undefined.
 *
 * Opt-in: `"blocks": true` in pikku.config.json means `src/blocks`, a string
 * names another directory. A folder that merely happens to be called `blocks`
 * is not a block library.
 */
export const blocksDir = (dir: string): string | undefined => {
  let config: { blocks?: unknown }
  try {
    config = JSON.parse(readFileSync(join(dir, 'pikku.config.json'), 'utf8'))
  } catch {
    return undefined
  }
  const declared = config.blocks
  if (declared === true) return DEFAULT_BLOCKS_DIR
  if (typeof declared === 'string' && declared) return declared
  return undefined
}

const collectBlocks = async (dir: string, out: string[] = []) => {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await collectBlocks(path, out)
    else if (isBlock(entry.name)) out.push(path)
  }
  return out
}

export const runBlockChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  const blocks = blocksDir(dir)
  if (!blocks) return findings

  for (const file of await collectBlocks(join(dir, blocks))) {
    const name = relative(dir, file)
    const literals = readJsxLiteralText(file, await readFile(file, 'utf8'))

    for (const { text, line } of literals) {
      findings.push({
        id: 'block-literal-string',
        severity: 'error',
        message: `${name}:${line} renders the literal string "${text}" — a block's words come from messages so the app can translate them`,
        path: file,
        fixHint:
          'Take the text as an I18nString prop, or read it from the messages module',
      })
    }

    if (!existsSync(file.replace(/\.tsx$/, '.stories.tsx'))) {
      findings.push({
        id: 'block-missing-stories',
        severity: 'warn',
        message: `${name} has no stories`,
        path: file,
        fixHint: `Add ${name.replace(/\.tsx$/, '.stories.tsx')} covering the block's states through props`,
      })
    }

    if (!literals.length) {
      findings.push({
        id: 'block-productized',
        severity: 'info',
        message: `${name} is productized`,
        path: file,
        fixHint: '',
      })
    }
  }

  return findings
}
