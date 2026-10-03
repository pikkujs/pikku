import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Confinement {
  root: string
  writable?: string[]
  readable?: string[]
  home?: string
}

const real = (path: string) => (existsSync(path) ? realpathSync(path) : path)

const quote = (path: string) => JSON.stringify(real(path))

const TOOLCHAIN = [
  '.bun',
  '.nvm',
  '.npm',
  '.cache',
  '.local',
  '.volta',
  '.fnm',
  '.yarn',
  '.pnpm-store',
  '.gitconfig',
  '.config/git',
  'Library/Caches',
  'Library/pnpm',
]

export function seatbeltProfile({ root, writable = [], readable = [], home = homedir() }: Confinement) {
  const writes = [root, tmpdir(), '/private/tmp', '/private/var/folders', '/dev', ...writable]
  const reads = [root, ...writable, ...readable, ...TOOLCHAIN.map((p) => join(home, p))]
  const cache = join(home, '.bun', 'install', 'cache')
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write* (subpath "/"))',
    `(allow file-write* ${writes.map((p) => `(subpath ${quote(p)})`).join(' ')})`,
    `(deny file-write* (subpath ${quote(home)}))`,
    `(allow file-write* ${[root, ...writable, cache].map((p) => `(subpath ${quote(p)})`).join(' ')})`,
    `(deny file-read* (subpath ${quote(home)}))`,
    `(allow file-read* (literal ${quote(home)}) ${reads.map((p) => `(subpath ${quote(p)})`).join(' ')})`,
    '(allow file-read-metadata)',
  ].join('\n')
}

export function bwrapArgs({ root, writable = [], readable = [], home = homedir() }: Confinement) {
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp']
  args.push('--tmpfs', home)
  for (const path of TOOLCHAIN.map((p) => join(home, p)).concat(readable)) {
    if (existsSync(path)) args.push('--ro-bind', path, path)
  }
  for (const path of [root, ...writable]) args.push('--bind', path, path)
  args.push('--chdir', root, '--die-with-parent')
  return args
}

export const canConfine = () =>
  process.platform === 'darwin' ||
  (process.platform === 'linux' &&
    (process.env.PATH ?? '').split(':').some((dir) => dir && existsSync(join(dir, 'bwrap'))))

export function confinedSpawn(
  command: string,
  args: string[],
  confinement: Confinement,
  options: SpawnOptions = {}
): ChildProcess {
  const opts = { cwd: confinement.root, ...options }
  if (process.platform === 'darwin') {
    return spawn('sandbox-exec', ['-p', seatbeltProfile(confinement), command, ...args], opts)
  }
  if (process.platform === 'linux') {
    return spawn('bwrap', [...bwrapArgs(confinement), command, ...args], opts)
  }
  throw new Error(`Studio cannot confine a process on ${process.platform}`)
}
