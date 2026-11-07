import { execFile } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const here = import.meta.dirname
const packages = join(here, '..', '..', 'packages')
const VENDORED = ['core', 'services/kysely']

/**
 * A stub workspace member for a Pikku package: installs stay inside it, and its
 * `dist` resolves to the one real build, so the project and the packages that
 * resolve upward from here share a single copy.
 */
const vendor = (repo: string, pkg: string) => {
  const source = join(packages, pkg)
  const manifest = JSON.parse(
    readFileSync(join(source, 'package.json'), 'utf8')
  )
  const dir = join(repo, 'vendor', basename(pkg))
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      type: manifest.type,
      types: manifest.types,
      exports: manifest.exports,
    })
  )
  symlinkSync(join(source, 'dist'), join(dir, 'dist'))
}
export const PIKKU = join(
  here,
  '..',
  '..',
  'packages',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)

export const git = async (cwd: string, ...args: string[]) =>
  (await exec('git', args, { cwd })).stdout

export type Fixture = { root: string; repo: string; worktrees: string }

/** A real repository, nested here so packages resolve upward to this verifier's. */
export const createFixture = async (): Promise<Fixture> => {
  const root = mkdtempSync(join(here, '.fixture-'))
  const repo = join(root, 'repo')
  const worktrees = join(root, 'worktrees')
  mkdirSync(worktrees)
  cpSync(join(here, 'template'), repo, { recursive: true })
  renameSync(join(repo, 'gitignore'), join(repo, '.gitignore'))
  renameSync(join(repo, 'oxlintrc.json'), join(repo, '.oxlintrc.json'))
  for (const pkg of VENDORED) vendor(repo, pkg)
  await exec('bun', ['install'], { cwd: repo })
  await git(repo, 'init', '-q', '-b', 'main')
  await git(repo, 'config', 'user.email', 'ci@example.invalid')
  await git(repo, 'config', 'user.name', 'ci')
  await commit(repo, 'initial')
  return { root, repo, worktrees }
}

export const commit = async (repo: string, message: string) => {
  await git(repo, 'add', '-A')
  await git(repo, 'commit', '-q', '-m', message)
}

export const removeFixture = ({ root }: Fixture) =>
  rmSync(root, { recursive: true, force: true })
