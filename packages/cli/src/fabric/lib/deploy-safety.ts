import { FabricPreconditionError } from './errors.js'
import { isTreeCleanBesidesProjectId } from './project-id.js'
import {
  currentBranch,
  headSha,
  localBranchHeadSha,
  remoteHeadSha,
  upstreamBranch,
  upstreamForBranch,
} from '../../utils/git.js'

export interface DeploySafetyResult {
  branch: string
  headSha: string
  upstream: string
  remoteSha: string
}

/**
 * Spec §10 deploy ref safety checks. Throws `FabricPreconditionError` on any
 * failure, with a message written to be the whole output; returns the resolved
 * commit context on pass.
 */
export async function assertDeploySafety(
  cwd?: string
): Promise<DeploySafetyResult> {
  if (!(await isTreeCleanBesidesProjectId(cwd))) {
    throw new FabricPreconditionError(
      'Deployment blocked: uncommitted changes detected.\nCommit and push your changes before deploying.'
    )
  }
  const branch = await currentBranch(cwd)
  const upstream = await upstreamBranch(cwd)
  if (!upstream) {
    throw new FabricPreconditionError(
      `Deployment blocked: branch ${branch} has no upstream.\nPush it (\`git push -u origin ${branch}\`) before deploying.`
    )
  }
  const head = await headSha(cwd)
  const remote = await remoteHeadSha(upstream, cwd)
  if (head !== remote) {
    throw new FabricPreconditionError(
      `Deployment blocked: local HEAD ${head.slice(0, 8)} ≠ remote ${remote.slice(0, 8)} (${upstream}).\nPush or pull before deploying.`
    )
  }
  return { branch, headSha: head, upstream, remoteSha: remote }
}

/**
 * Validate a named branch for deploy without depending on the currently
 * checked-out branch. This is the Fabric CLI deploy contract: deploy the
 * target branch, not "whatever branch I happen to be on".
 */
export async function assertNamedBranchDeploySafety(
  branch: string,
  cwd?: string
): Promise<DeploySafetyResult> {
  let head: string
  try {
    head = await localBranchHeadSha(branch, cwd)
  } catch (error: any) {
    throw new FabricPreconditionError(
      `Deployment blocked: local branch ${branch} does not exist (${error.message}).\nFetch or create it before deploying.`
    )
  }

  const upstream = await upstreamForBranch(branch, cwd)
  if (!upstream) {
    throw new FabricPreconditionError(
      `Deployment blocked: branch ${branch} has no upstream.\nPush it (\`git push -u origin ${branch}\`) before deploying.`
    )
  }

  const remote = await remoteHeadSha(upstream, cwd)
  if (head !== remote) {
    throw new FabricPreconditionError(
      `Deployment blocked: ${branch} ${head.slice(0, 8)} ≠ remote ${remote.slice(0, 8)} (${upstream}).\nPush or pull ${branch} before deploying.`
    )
  }

  return { branch, headSha: head, upstream, remoteSha: remote }
}
