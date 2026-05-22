import { spawn } from 'node:child_process'

/**
 * Local git probes for the deploy safety checks (clean tree, HEAD == remote,
 * ref resolution). Shell out to `git` rather than depend on simple-git —
 * matches what wrangler/vercel/fly do, no runtime dep.
 */

export class GitError extends Error {
  constructor(
    public command: string,
    public exitCode: number,
    public stderr: string
  ) {
    super(`git ${command} failed (${exitCode}): ${stderr.trim()}`)
  }
}

function git(args: string[], cwd = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
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

export interface DeploySafetyResult {
  branch: string
  headSha: string
  upstream: string
  remoteSha: string
}

/**
 * Spec §10 deploy ref safety checks. Throws on any failure with a CLI-friendly
 * message; returns the resolved commit context on pass.
 */
export async function assertDeploySafety(
  cwd?: string
): Promise<DeploySafetyResult> {
  if (!(await isWorkingTreeClean(cwd))) {
    throw new Error(
      'Deployment blocked: uncommitted changes detected.\nCommit and push your changes before deploying.'
    )
  }
  const branch = await currentBranch(cwd)
  const upstream = await upstreamBranch(cwd)
  if (!upstream) {
    throw new Error(
      `Deployment blocked: branch ${branch} has no upstream.\nPush it (\`git push -u origin ${branch}\`) before deploying.`
    )
  }
  const head = await headSha(cwd)
  const remote = await remoteHeadSha(upstream, cwd)
  if (head !== remote) {
    throw new Error(
      `Deployment blocked: local HEAD ${head.slice(0, 8)} ≠ remote ${remote.slice(0, 8)} (${upstream}).\nPush or pull before deploying.`
    )
  }
  return { branch, headSha: head, upstream, remoteSha: remote }
}
