import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Confinement } from './confine.js'

const exec = promisify(execFile)

const git = async (cwd: string, ...args: string[]) =>
  (await exec('git', args, { cwd })).stdout.trim()

const IDENTITY = ['-c', 'user.name=Pikku Studio', '-c', 'user.email=studio@pikku.dev']

export interface StudioWorktree {
  path: string
  branch: string
  gitDir: string
  projectDir: string
}

const inRepo = (path: string) =>
  git(path, 'rev-parse', '--show-toplevel').then(() => true, () => false)

export async function ensureRepo(path: string): Promise<void> {
  if (!(await inRepo(path))) await git(path, 'init', '-q', '-b', 'main')
  if (await git(path, 'rev-parse', '--verify', '-q', 'HEAD').then(() => true, () => false)) return
  await git(path, 'add', '-A')
  await git(path, ...IDENTITY, 'commit', '-q', '--allow-empty', '-m', 'Start')
}

export async function commitPaths(repo: string, paths: string[], message: string): Promise<void> {
  await ensureRepo(repo)
  await git(repo, 'add', '--', ...paths)
  const staged = await git(repo, 'diff', '--cached', '--quiet', '--', ...paths).then(() => false, () => true)
  if (staged) await git(repo, ...IDENTITY, 'commit', '-q', '-m', message, '--', ...paths)
}

export async function ensureWorktree(
  repo: string,
  studioHome: string,
  id: string
): Promise<StudioWorktree> {
  await ensureRepo(repo)
  const prefix = await git(repo, 'rev-parse', '--show-prefix')
  const path = join(studioHome, 'worktrees', id)
  const branch = `studio/${id}`
  if (!existsSync(path)) {
    await mkdir(join(studioHome, 'worktrees'), { recursive: true })
    await git(repo, 'worktree', 'add', '-q', '-B', branch, path, 'HEAD')
  }
  const common = await git(path, 'rev-parse', '--git-common-dir')
  return {
    path,
    branch,
    gitDir: isAbsolute(common) ? common : resolve(path, common),
    projectDir: prefix ? join(path, prefix.replace(/\/$/, '')) : path,
  }
}

export const worktreeConfinement = (worktree: StudioWorktree): Confinement => ({
  root: worktree.path,
  writable: [worktree.gitDir],
})

export interface KeepStatus {
  folder: string
  target: string | null
  commits: { sha: string; subject: string }[]
  unsaved: number
}

export type KeepResult = { ok: true; kept: number } | { ok: false; reason: 'conflict' | 'edited'; files: string[] }

const SCRATCH = ['--', '.', ':(exclude,glob)**/.pikku/**']

const tryGit = (cwd: string, ...args: string[]) =>
  exec('git', args, { cwd }).then(
    (r) => ({ ok: true, output: r.stdout.trim() }),
    (e: { stdout?: string; stderr?: string }) => ({ ok: false, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() })
  )

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)

export async function keepStatus(repo: string, worktree: StudioWorktree): Promise<KeepStatus> {
  const folder = await git(repo, 'rev-parse', '--show-toplevel')
  const target = (await tryGit(folder, 'symbolic-ref', '--short', '-q', 'HEAD')).output || null
  const log = await git(folder, 'log', '--format=%h%x09%s', `HEAD..${worktree.branch}`)
  const unsaved = lines(await git(worktree.path, 'status', '--porcelain', ...SCRATCH)).length
  return { folder, target, unsaved, commits: lines(log).map((l) => ({ sha: l.split('\t')[0]!, subject: l.split('\t').slice(1).join('\t') })) }
}

export async function keepChanges(repo: string, worktree: StudioWorktree): Promise<KeepResult> {
  const folder = await git(repo, 'rev-parse', '--show-toplevel')
  await git(worktree.path, 'add', '-A', ...SCRATCH)
  if (!(await tryGit(worktree.path, 'diff', '--cached', '--quiet')).ok) {
    await git(worktree.path, ...IDENTITY, 'commit', '-q', '--no-verify', '-m', 'Changes from the builder')
  }
  const head = await git(folder, 'rev-parse', 'HEAD')
  const synced = await tryGit(worktree.path, ...IDENTITY, 'merge', '-q', '--no-edit', head)
  if (!synced.ok) {
    const files = lines(await git(worktree.path, 'diff', '--name-only', '--diff-filter=U'))
    await tryGit(worktree.path, 'merge', '--abort')
    return { ok: false, reason: 'conflict', files }
  }
  const kept = Number(await git(folder, 'rev-list', '--count', `HEAD..${worktree.branch}`))
  if (kept === 0) return { ok: true, kept }
  const merged = await tryGit(folder, 'merge', '-q', '--ff-only', worktree.branch)
  if (!merged.ok) {
    const files = lines(merged.output).filter((l) => !/^(error|hint|fatal|Please|Aborting|Updating)\b/.test(l) && !l.endsWith(':'))
    return { ok: false, reason: 'edited', files }
  }
  return { ok: true, kept }
}
