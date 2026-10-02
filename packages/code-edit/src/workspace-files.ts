import { mkdir, open, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resolveWorkspacePath } from './workspace-path.js'

export { WorkspacePathError, resolveWorkspacePath } from './workspace-path.js'

export type WorkspaceEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
}

export type WorkspaceFile = {
  path: string
  size: number
  content: string
  binary: boolean
  truncated: boolean
}

export const DEFAULT_IGNORED = [
  '.git',
  'node_modules',
  '.yarn',
  'dist',
  '.deploy',
  '.vite',
  '.tanstack',
  '.DS_Store',
]

const isSecret = (name: string) =>
  (name === '.env' || name.startsWith('.env.') || name === '.dev.vars') &&
  !name.endsWith('.example')

/** Thrown when a requested file does not exist or is a directory. */
export class WorkspaceFileNotFoundError extends Error {}

/** Lists and reads files under one workspace root, never outside it. */
export class WorkspaceFilesService {
  private readonly ignored: Set<string>
  private readonly maxFileBytes: number

  constructor(
    private readonly root: string,
    options: { ignored?: string[]; maxFileBytes?: number } = {}
  ) {
    this.ignored = new Set(options.ignored ?? DEFAULT_IGNORED)
    this.maxFileBytes = options.maxFileBytes ?? 1_000_000
  }

  private hidden(name: string) {
    return this.ignored.has(name) || isSecret(name)
  }

  /** One directory's entries, directories first; a directory that does not exist yet lists as empty. */
  async list(path = ''): Promise<WorkspaceEntry[]> {
    const { abs, rel } = resolveWorkspacePath(this.root, path)
    const entries = await readdir(abs, { withFileTypes: true }).catch(
      (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return []
        throw err
      }
    )
    return entries
      .filter((e) => !this.hidden(e.name))
      .map((e) => ({
        name: e.name,
        path: rel ? `${rel}/${e.name}` : e.name,
        type: e.isDirectory() ? ('directory' as const) : ('file' as const),
      }))
      .sort((a, b) =>
        a.type !== b.type
          ? a.type === 'directory'
            ? -1
            : 1
          : a.name.localeCompare(b.name)
      )
  }

  /** A file's text, cut at `maxFileBytes`; binary files come back with empty content. */
  async read(path: string): Promise<WorkspaceFile> {
    const { abs, rel } = resolveWorkspacePath(this.root, path)
    const info = rel.split('/').some((part) => this.hidden(part))
      ? null
      : await stat(abs).catch(() => null)
    if (!info || !info.isFile())
      throw new WorkspaceFileNotFoundError(`no file at ${rel || '/'}`)
    const length = Math.min(info.size, this.maxFileBytes)
    const buffer = Buffer.alloc(length)
    const handle = await open(abs, 'r')
    try {
      await handle.read(buffer, 0, length, 0)
    } finally {
      await handle.close()
    }
    const binary = buffer.subarray(0, 8000).includes(0)
    return {
      path: rel,
      size: info.size,
      content: binary ? '' : buffer.toString('utf-8'),
      binary,
      truncated: info.size > length,
    }
  }

  /** Writes a text file, creating it and its folders if needed; secrets and ignored folders are refused. */
  async write(path: string, content: string): Promise<{ path: string; size: number }> {
    const { abs, rel } = resolveWorkspacePath(this.root, path)
    if (!rel || rel.split('/').some((part) => this.hidden(part)))
      throw new WorkspaceFileNotFoundError(`cannot write ${rel || '/'}`)
    const info = await stat(abs).catch(() => null)
    if (info?.isDirectory())
      throw new WorkspaceFileNotFoundError(`${rel} is a directory`)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf-8')
    return { path: rel, size: Buffer.byteLength(content) }
  }
}
