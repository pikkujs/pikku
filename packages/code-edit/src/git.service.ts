import { spawn } from 'node:child_process'
import { resolveWorkspacePath } from './workspace-path.js'

export { WorkspacePathError } from './workspace-path.js'

export type GitRunResult = {
  code: number | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
}

/** Runs `git` with no prompt, a hard timeout and a cap on captured stdout. */
export function runGit(
  cwd: string,
  args: string[],
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<GitRunResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const maxBytes = options.maxBytes ?? 5_000_000
  return new Promise((resolvePromise) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        SSH_ASKPASS_REQUIRE: 'never',
        GCM_INTERACTIVE: 'never',
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    let outBytes = 0
    let stderr = ''
    let truncated = false
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return
      const room = maxBytes - outBytes
      if (chunk.length > room) {
        out.push(chunk.subarray(0, room))
        outBytes = maxBytes
        truncated = true
        child.kill('SIGKILL')
        return
      }
      out.push(chunk)
      outBytes += chunk.length
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 64_000) stderr += chunk.toString()
    })
    const finish = (code: number | null, error?: Error) => {
      clearTimeout(timer)
      resolvePromise({
        code,
        stdout: Buffer.concat(out).toString('utf-8'),
        stderr: error ? `${stderr}${error.message}` : stderr,
        truncated,
        timedOut,
      })
    }
    child.on('error', (error) => finish(null, error))
    child.on('close', (code) => finish(code))
  })
}

/** A git command that failed; `stderr` carries git's own reason. */
export class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly stderr: string,
    readonly timedOut = false
  ) {
    super(
      timedOut
        ? `git ${args[0]} timed out`
        : stderr.trim().split('\n').slice(0, 4).join(' ') ||
            `git ${args[0]} failed`
    )
  }
}

export type GitFileStatus =
  'staged' | 'modified' | 'untracked' | 'deleted' | 'renamed' | 'conflicted'

export type GitStatusEntry = {
  path: string
  status: GitFileStatus
  index: string
  worktree: string
  from?: string
}

export type GitStatus = {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  clean: boolean
  files: GitStatusEntry[]
}

export type GitCommit = {
  sha: string
  shortSha: string
  author: string
  email: string
  date: string
  subject: string
}

export type GitDiff = { diff: string; truncated: boolean }

export type GitCommitResult = {
  status: 'noop' | 'committed'
  sha: string | null
  shortSha: string | null
  branch: string | null
  paths: string[]
}

export type GitPullResult =
  | {
      updated: boolean
      branch: string | null
      fromSha: string | null
      toSha: string | null
    }
  | {
      updated: false
      branch: string | null
      reason: 'no-upstream' | 'diverged' | 'local-changes'
      message: string
    }

export type GitPushResult =
  | { pushed: true; branch: string; remote: string }
  | {
      pushed: false
      branch: string | null
      reason: 'detached' | 'no-remote' | 'non-fast-forward'
      message: string
    }

const REF = /^(?!-)[\w./~^@{}-]{1,250}$/

const conflicted = (x: string, y: string): boolean =>
  x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')

const classify = (x: string, y: string): GitFileStatus => {
  if (conflicted(x, y)) return 'conflicted'
  if (x === '?' && y === '?') return 'untracked'
  if (x === 'R' || x === 'C') return 'renamed'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x !== ' ') return 'staged'
  return 'modified'
}

/** Local git for one workspace: status, log, diff, path-scoped commit, fast-forward pull and push over the user's own remote credentials. */
export class GitService {
  constructor(
    private readonly root: string,
    private readonly options: {
      timeoutMs?: number
      networkTimeoutMs?: number
    } = {}
  ) {}

  private async git(
    args: string[],
    extra: { network?: boolean; maxBytes?: number; allowCodes?: number[] } = {}
  ): Promise<GitRunResult> {
    const result = await runGit(this.root, args, {
      timeoutMs: extra.network
        ? (this.options.networkTimeoutMs ?? 120_000)
        : (this.options.timeoutMs ?? 30_000),
      maxBytes: extra.maxBytes,
    })
    const ok =
      result.code === 0 || extra.allowCodes?.includes(result.code ?? -1)
    if (result.timedOut || (!ok && !result.truncated))
      throw new GitCommandError(args, result.stderr, result.timedOut)
    return result
  }

  private async prefix(): Promise<string> {
    return (await this.git(['rev-parse', '--show-prefix'])).stdout.trim()
  }

  private async scopedTo(paths: string[]): Promise<string[]> {
    const prefix = await this.prefix()
    return paths.map((p) => {
      const { rel } = resolveWorkspacePath(this.root, p)
      return `:(top,literal)${prefix}${rel}`
    })
  }

  private async currentBranch(): Promise<string | null> {
    const result = await runGit(this.root, [
      'symbolic-ref',
      '--short',
      '-q',
      'HEAD',
    ])
    return result.code === 0 ? result.stdout.trim() || null : null
  }

  private async head(): Promise<string | null> {
    const result = await runGit(this.root, [
      'rev-parse',
      '-q',
      '--verify',
      'HEAD',
    ])
    return result.code === 0 ? result.stdout.trim() || null : null
  }

  /** Working-tree status for the workspace, untracked files listed individually, paths relative to the workspace root. */
  async status(): Promise<GitStatus> {
    const prefix = await this.prefix()
    const { stdout } = await this.git([
      'status',
      '--porcelain=v1',
      '-z',
      '--branch',
      '--untracked-files=all',
      '--',
      '.',
    ])
    const parts = stdout.split('\0')
    let branch: string | null = null
    let upstream: string | null = null
    let ahead = 0
    let behind = 0
    const files: GitStatusEntry[] = []
    const strip = (p: string) =>
      p.startsWith(prefix) ? p.slice(prefix.length) : p
    for (let i = 0; i < parts.length; i++) {
      const line = parts[i]
      if (!line) continue
      if (line.startsWith('## ')) {
        const header = line.slice(3)
        const m = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(header)
        const name = m?.[1] ?? header
        branch = name.startsWith('HEAD (no branch)')
          ? null
          : name.replace(/^No commits yet on /, '')
        upstream = m?.[2] ?? null
        ahead = Number(/ahead (\d+)/.exec(m?.[3] ?? '')?.[1] ?? 0)
        behind = Number(/behind (\d+)/.exec(m?.[3] ?? '')?.[1] ?? 0)
        continue
      }
      const x = line[0]
      const y = line[1]
      const entry: GitStatusEntry = {
        path: strip(line.slice(3)),
        status: classify(x, y),
        index: x,
        worktree: y,
      }
      if (x === 'R' || x === 'C') entry.from = strip(parts[++i] ?? '')
      files.push(entry)
    }
    return { branch, upstream, ahead, behind, clean: files.length === 0, files }
  }

  /** The newest commits on HEAD, optionally only those touching `path`. */
  async log(
    options: { limit?: number; path?: string; ref?: string } = {}
  ): Promise<GitCommit[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 30, 500))
    if (options.ref && !REF.test(options.ref))
      throw new GitCommandError(['log'], 'invalid ref')
    if (!(await this.head())) return []
    const args = [
      'log',
      `--max-count=${limit}`,
      '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e',
      options.ref ?? 'HEAD',
      '--',
      ...(options.path ? await this.scopedTo([options.path]) : []),
    ]
    const { stdout } = await this.git(args)
    return stdout
      .split('\x1e')
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => {
        const [sha, shortSha, author, email, date, subject] = e.split('\x1f')
        return { sha, shortSha, author, email, date, subject }
      })
  }

  /** A unified diff: the working tree against the index, against `ref`, or the staged changes; an untracked `path` diffs against nothing. */
  async diff(
    options: {
      path?: string
      staged?: boolean
      ref?: string
      maxBytes?: number
    } = {}
  ): Promise<GitDiff> {
    if (options.ref && !REF.test(options.ref))
      throw new GitCommandError(['diff'], 'invalid ref')
    const maxBytes = options.maxBytes ?? 2_000_000
    if (options.path && !options.staged && !options.ref) {
      const [spec] = await this.scopedTo([options.path])
      const tracked = await runGit(this.root, [
        'ls-files',
        '--error-unmatch',
        '--',
        spec,
      ])
      if (tracked.code !== 0) {
        const { rel } = resolveWorkspacePath(this.root, options.path)
        const result = await this.git(
          ['diff', '--no-index', '--no-color', '--', '/dev/null', rel],
          { maxBytes, allowCodes: [1] }
        )
        return { diff: result.stdout, truncated: result.truncated }
      }
    }
    const args = ['diff', '--no-color', '--no-ext-diff']
    if (options.staged) args.push('--cached')
    if (options.ref) args.push(options.ref)
    args.push(
      '--',
      ...(options.path ? await this.scopedTo([options.path]) : ['.'])
    )
    const result = await this.git(args, { maxBytes })
    return { diff: result.stdout, truncated: result.truncated }
  }

  /** Commits exactly `paths` (new, changed or deleted) and nothing else already staged; a clean scope is a noop. */
  async commit(input: {
    message: string
    paths: string[]
  }): Promise<GitCommitResult> {
    const message = input.message.trim()
    if (!message)
      throw new GitCommandError(['commit'], 'a commit message is required')
    if (input.paths.length === 0)
      throw new GitCommandError(['commit'], 'name the paths to commit')
    const specs = await this.scopedTo(input.paths)
    const branch = await this.currentBranch()
    const dirty = await this.git([
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--',
      ...specs,
    ])
    if (!dirty.stdout.trim())
      return { status: 'noop', sha: null, shortSha: null, branch, paths: [] }
    await this.git(['add', '-A', '--', ...specs])
    await this.git(['commit', '-q', '-m', message, '--', ...specs])
    const sha = await this.head()
    const { stdout } = await this.git([
      'show',
      '--name-only',
      '--format=',
      '--relative',
      '-z',
      'HEAD',
    ])
    return {
      status: 'committed',
      sha,
      shortSha: sha ? sha.slice(0, 7) : null,
      branch,
      paths: stdout.split('\0').filter(Boolean),
    }
  }

  /** Fetches and fast-forwards the current branch to its upstream; never merges or discards local edits. */
  async pull(): Promise<GitPullResult> {
    const branch = await this.currentBranch()
    const upstream = await runGit(this.root, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}',
    ])
    if (!branch || upstream.code !== 0)
      return {
        updated: false,
        branch,
        reason: 'no-upstream',
        message: 'The current branch has no upstream to pull from.',
      }
    const fromSha = await this.head()
    await this.git(['fetch', '--no-tags', '--quiet'], { network: true })
    const merged = await runGit(
      this.root,
      ['merge', '--ff-only', '--quiet', '@{u}'],
      {
        timeoutMs: this.options.timeoutMs ?? 30_000,
      }
    )
    if (merged.code !== 0) {
      const local = /local changes|would be overwritten|not uptodate/i.test(
        merged.stderr
      )
      return {
        updated: false,
        branch,
        reason: local ? 'local-changes' : 'diverged',
        message: local
          ? 'Local edits would be overwritten by the pull; nothing was changed.'
          : `The branch has diverged from ${upstream.stdout.trim()}; nothing was changed.`,
      }
    }
    const toSha = await this.head()
    return { updated: fromSha !== toSha, branch, fromSha, toSha }
  }

  /** Pushes the current branch with the user's own git credentials, setting the upstream on `origin` when it has none. */
  async push(): Promise<GitPushResult> {
    const branch = await this.currentBranch()
    if (!branch)
      return {
        pushed: false,
        branch: null,
        reason: 'detached',
        message: 'HEAD is detached; check out a branch to push.',
      }
    const configured = await runGit(this.root, [
      'config',
      '--get',
      `branch.${branch}.remote`,
    ])
    const remote = configured.code === 0 ? configured.stdout.trim() : 'origin'
    const remotes = (await this.git(['remote'])).stdout
      .split('\n')
      .map((r) => r.trim())
    if (!remotes.includes(remote))
      return {
        pushed: false,
        branch,
        reason: 'no-remote',
        message: `There is no "${remote}" remote to push to.`,
      }
    const args =
      configured.code === 0
        ? ['push', '--porcelain', remote, `HEAD:refs/heads/${branch}`]
        : [
            'push',
            '--porcelain',
            '--set-upstream',
            remote,
            `HEAD:refs/heads/${branch}`,
          ]
    const result = await runGit(this.root, args, {
      timeoutMs: this.options.networkTimeoutMs ?? 120_000,
    })
    if (result.code === 0) return { pushed: true, branch, remote }
    const text = `${result.stdout}\n${result.stderr}`
    if (
      !result.timedOut &&
      /non-fast-forward|\[rejected\]|fetch first/i.test(text)
    )
      return {
        pushed: false,
        branch,
        reason: 'non-fast-forward',
        message: `${remote}/${branch} has commits this branch does not; pull before pushing.`,
      }
    throw new GitCommandError(args, result.stderr, result.timedOut)
  }
}
