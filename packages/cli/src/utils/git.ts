import { spawn } from 'node:child_process'
import { PikkuError } from '@pikku/core/errors'

/**
 * Local git probes for the deploy safety checks (clean tree, HEAD == remote,
 * ref resolution). Shell out to `git` rather than depend on simple-git —
 * matches what wrangler/vercel/fly do, no runtime dep.
 */

/**
 * A `git` invocation that came back non-zero.
 *
 * A `PikkuError`, because the message already carries the whole diagnosis —
 * which command, which exit code, and git's own stderr — and ten frames of the
 * spawn helper in front of "fatal: not a git repository" answer a question
 * nobody asked. `--verbose` / `PIKKU_DEBUG` still prints the stack.
 */
export class GitError extends PikkuError {
  constructor(
    public command: string,
    public exitCode: number,
    public stderr: string
  ) {
    super(`git ${command} failed (${exitCode}): ${stderr.trim()}`)
  }
}

/**
 * Repository-location variables git exports to its hooks. `git push` from a
 * worktree sets GIT_DIR, and a hook's children inherit it — after which git
 * answers about the hook's repository no matter which directory it is run in,
 * so a probe given a `cwd` outside any repository reports that repository's
 * state instead of "no repository". Every probe below picks its repository by
 * `cwd`, so the inherited pointer is always wrong here and is dropped.
 */
const REPO_LOCATION_ENV = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
] as const

export function envWithoutInheritedRepo(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of REPO_LOCATION_ENV) {
    delete env[key]
  }
  return env
}

export function git(
  args: string[],
  cwd = process.cwd(),
  extraEnv?: NodeJS.ProcessEnv
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...envWithoutInheritedRepo(), ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (b) => (stdout += b.toString()))
    child.stderr.on('data', (b) => (stderr += b.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new GitError(args.join(' '), code ?? -1, stderr))
    })
  })
}

export async function currentBranch(cwd?: string): Promise<string> {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
}

/**
 * Returns the fetch URL for the given remote, with credentials and .git suffix
 * stripped so it's safe to store server-side or pass to importProject.
 */
export async function getRemoteUrl(
  remote = 'origin',
  cwd?: string
): Promise<string> {
  const raw = await git(['remote', 'get-url', remote], cwd)
  // Convert SSH format (git@github.com:owner/repo.git) to HTTPS
  const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }
  return raw.replace(/\.git$/, '').replace(/^(https?:\/\/)[^@]+@/, '$1')
}

export async function headSha(cwd?: string): Promise<string> {
  return git(['rev-parse', 'HEAD'], cwd)
}

export async function localBranchHeadSha(
  branch: string,
  cwd?: string
): Promise<string> {
  return git(['rev-parse', '--verify', `${branch}^{commit}`], cwd)
}

export async function isWorkingTreeClean(cwd?: string): Promise<boolean> {
  const out = await git(['status', '--porcelain'], cwd)
  return out.length === 0
}

export async function upstreamBranch(cwd?: string): Promise<string | null> {
  try {
    return await git(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      cwd
    )
  } catch {
    return null
  }
}

export async function upstreamForBranch(
  branch: string,
  cwd?: string
): Promise<string | null> {
  try {
    return await git(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{u}`],
      cwd
    )
  } catch {
    return null
  }
}

export async function remoteHeadSha(
  upstream: string,
  cwd?: string
): Promise<string> {
  return git(['rev-parse', upstream], cwd)
}

/**
 * Resolve a ref (branch / tag / sha) to a sha. Returns null if git can't
 * resolve it, so callers can fall back to "use HEAD".
 */
export async function resolveRef(
  ref: string,
  cwd?: string
): Promise<string | null> {
  try {
    return await git(['rev-parse', '--verify', `${ref}^{commit}`], cwd)
  } catch {
    return null
  }
}

/**
 * Spec §7 ancestry check: is `candidate` reachable from `mainRef` (i.e. has
 * mainRef been merged forward to include candidate)?
 *
 * `git merge-base --is-ancestor` exits 0 if candidate is an ancestor of
 * mainRef, 1 if not, anything else on hard error.
 */
export async function isAncestor(
  candidate: string,
  mainRef: string,
  cwd?: string
): Promise<boolean> {
  try {
    await git(['merge-base', '--is-ancestor', candidate, mainRef], cwd)
    return true
  } catch (err) {
    if (err instanceof GitError && err.exitCode === 1) return false
    throw err
  }
}

/**
 * Is `relPath` tracked by git in `cwd`?
 *
 * Deploy clones the repository rather than uploading the working tree, so a
 * file that exists only on disk does not exist for the build container. Any
 * check that reads a required file locally has to ask this too, or it passes
 * on the developer's machine and fails after the clone.
 *
 * Returns false rather than throwing when `cwd` is not a git repository. Note
 * what that means for a caller: "not tracked" and "no repository at all" are
 * the same answer, and only the first is a problem worth reporting — a project
 * with no repository cannot be deployed by a clone in any case, and flagging an
 * uncommitted file there is noise. Pair this with `isGitRepo` when the
 * distinction matters.
 */
export async function isTracked(
  relPath: string,
  cwd = process.cwd()
): Promise<boolean> {
  try {
    await git(['ls-files', '--error-unmatch', '--', relPath], cwd)
    return true
  } catch {
    return false
  }
}

/**
 * Is `cwd` inside a git working tree?
 *
 * Separate from `isTracked` so a caller can tell "this repository does not have
 * the file" from "there is no repository", which are the same `false` there.
 */
export async function isGitRepo(cwd = process.cwd()): Promise<boolean> {
  try {
    const out = await git(['rev-parse', '--is-inside-work-tree'], cwd)
    return out.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Does this repository have the given remote?
 *
 * Separate from `getRemoteUrl` throwing, because "no origin" is an ordinary
 * state that `link` acts on rather than an error it reports: a developer who
 * has not pushed anywhere yet is exactly who repo provisioning is for.
 */
export async function hasRemote(
  remote = 'origin',
  cwd?: string
): Promise<boolean> {
  try {
    await git(['remote', 'get-url', remote], cwd)
    return true
  } catch {
    return false
  }
}

/** Does HEAD resolve? False in a repository with no commits yet. */
export async function hasCommits(cwd?: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--verify', 'HEAD'], cwd)
    return true
  } catch {
    return false
  }
}

export async function addRemote(
  name: string,
  url: string,
  cwd?: string
): Promise<void> {
  await git(['remote', 'add', name, url], cwd)
}

export async function removeRemote(name: string, cwd?: string): Promise<void> {
  try {
    await git(['remote', 'remove', name], cwd)
  } catch {
    /* best-effort: only used to undo a remote we just added */
  }
}

/**
 * Push `branch` to `remote` and set it as upstream, authenticating with a
 * one-shot credential.
 *
 * The credential is passed through the ENVIRONMENT and read back by an inline
 * credential helper, rather than embedded in the remote URL. Both a URL like
 * `https://user:token@host/...` and `-c http.<url>.extraheader=...` put the
 * secret in the process's argv, where any other user on the machine can read it
 * out of `ps`. This way argv holds only the shape of the helper, and the token
 * never reaches `.git/config` either — so it cannot outlive the push.
 */
export async function pushWithCredential(
  remote: string,
  branch: string,
  credential: { username: string; password: string },
  cwd?: string
): Promise<void> {
  await git(
    [
      '-c',
      'credential.helper=',
      '-c',
      'credential.helper=!f() { echo "username=$PIKKU_GIT_USERNAME"; echo "password=$PIKKU_GIT_PASSWORD"; }; f',
      'push',
      '-u',
      remote,
      `HEAD:refs/heads/${branch}`,
    ],
    cwd,
    {
      PIKKU_GIT_USERNAME: credential.username,
      PIKKU_GIT_PASSWORD: credential.password,
      // Any configured interactive helper (osxkeychain, a GUI prompt) would be
      // consulted first and could hang a CLI with no one at the terminal. The
      // empty `credential.helper=` above resets the inherited list; this stops
      // git falling back to a terminal prompt if ours somehow yields nothing.
      GIT_TERMINAL_PROMPT: '0',
    }
  )
}
