import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readJsxLiteralText } from '@pikku/inspector'
import type { ValidateFinding } from './persona-checks.js'

const isBlock = (name: string) =>
  name.endsWith('.tsx') &&
  !name.endsWith('.stories.tsx') &&
  !name.endsWith('.test.tsx')

const BLOCKS_DIR = 'src/blocks'

/**
 * The package names the project's pikku.config.json lists under `blocks`, or
 * undefined when it lists none. A package is a block library because the
 * project says so, never because of what the folder is called.
 */
export const declaredBlockPackages = (root: string): string[] | undefined => {
  let config: { blocks?: unknown }
  try {
    config = JSON.parse(readFileSync(join(root, 'pikku.config.json'), 'utf8'))
  } catch {
    return undefined
  }
  const { blocks } = config
  if (!Array.isArray(blocks)) return undefined
  return blocks.filter((name): name is string => typeof name === 'string')
}

const packageName = (dir: string): string | undefined => {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name
  } catch {
    return undefined
  }
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

const checkPackage = async (
  name: string,
  dir: string
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  const blocksPath = join(dir, BLOCKS_DIR)
  const files = await collectBlocks(blocksPath)

  if (!existsSync(blocksPath)) {
    return [
      {
        id: 'block-package-no-blocks',
        severity: 'error',
        message: `${name} is listed under "blocks" in pikku.config.json but has no ${BLOCKS_DIR} directory`,
        path: dir,
        fixHint: `Put the blocks in ${BLOCKS_DIR}, or remove ${name} from "blocks"`,
      },
    ]
  }

  for (const file of files) {
    const shown = relative(dir, file)
    const literals = readJsxLiteralText(file, await readFile(file, 'utf8'))

    for (const { text, line } of literals) {
      findings.push({
        id: 'block-literal-string',
        severity: 'error',
        message: `${name}: ${shown}:${line} renders the literal string "${text}" — a block's words come from messages so the app can translate them`,
        path: file,
        fixHint:
          'Take the text as an I18nString prop, or read it from the messages module',
      })
    }

    if (!existsSync(file.replace(/\.tsx$/, '.stories.tsx'))) {
      findings.push({
        id: 'block-missing-stories',
        severity: 'warn',
        message: `${name}: ${shown} has no stories`,
        path: file,
        fixHint: `Add ${shown.replace(/\.tsx$/, '.stories.tsx')} covering the block's states through props`,
      })
    }

    if (!literals.length) {
      findings.push({
        id: 'block-productized',
        severity: 'info',
        message: `${name}: ${shown} is productized`,
        path: file,
        fixHint: '',
      })
    }
  }

  return findings
}

/**
 * Checks every package the project's pikku.config.json lists under `blocks`.
 * A listed name that no workspace package carries is an error: a typo here
 * would otherwise mean the checks quietly never run.
 */
export const runBlockChecks = async (
  root: string,
  packages: Array<{ dir: string }>
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  const byName = new Map<string, string>()
  for (const { dir } of packages) {
    const name = packageName(dir)
    if (name) byName.set(name, dir)
  }

  for (const name of declaredBlockPackages(root) ?? []) {
    const dir = byName.get(name)
    if (!dir) {
      findings.push({
        id: 'block-package-missing',
        severity: 'error',
        message: `"${name}" is listed under "blocks" in pikku.config.json but no package with that name exists in this project`,
        path: join(root, 'pikku.config.json'),
        fixHint: `Fix the package name, or remove it from "blocks"`,
      })
      continue
    }
    findings.push(...(await checkPackage(name, dir)))
  }

  return findings
}
