import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitIn } from './git.js'

const here = dirname(fileURLToPath(import.meta.url))

/** The repository root; throwaway repos go in its git-ignored `.tmp/`. */
export const REPO_ROOT = resolve(here, '../../../../..')
export const FAKE_CLI = join(here, 'fixtures', 'fake-cli.mjs')

const made: string[] = []

/** A fresh `git init` repo under `.tmp/` with one commit holding `files`. */
export const throwawayRepo = async (
  files: Record<string, string> = {}
): Promise<string> => {
  const parent = join(REPO_ROOT, '.tmp')
  await mkdir(parent, { recursive: true })
  const dir = await mkdtemp(join(parent, 'harness-test-'))
  made.push(dir)
  const git = gitIn(dir)
  await git(['init', '-q', '-b', 'main'])
  await git(['config', 'user.name', 'Harness Test'])
  await git(['config', 'user.email', 'harness-test@example.invalid'])
  await git(['config', 'commit.gpgsign', 'false'])
  for (const [path, content] of Object.entries({
    'README.md': 'repo\n',
    ...files,
  })) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'init'])
  return dir
}

export const removeThrowaways = async () => {
  while (made.length) await rm(made.pop()!, { recursive: true, force: true })
}
