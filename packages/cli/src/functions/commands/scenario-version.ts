import {
  hasCommits,
  headSha,
  isGitRepo,
  isWorkingTreeClean,
} from '../../fabric/lib/git.js'
import type { ScenarioRunStore, ScenarioRunVersion } from '@pikku/core/scenario'

/**
 * What version of the suite this run is about to be.
 *
 * The commit comes from the working tree the scenarios were read out of, and
 * the attempt from the runs already filed against it — so re-running a suite
 * until it passes reads as one version with several attempts, and two runs of
 * different commits are never mistaken for a flake.
 *
 * Every step of this is allowed to come back empty. A project outside git, a
 * repository with no commits, a store that cannot be listed: none of them are
 * reasons to refuse to run, so the run is simply filed without a version.
 */
export const resolveScenarioRunVersion = async (
  store: Pick<ScenarioRunStore, 'list'>,
  cwd: string
): Promise<ScenarioRunVersion | undefined> => {
  if (!(await isGitRepo(cwd)) || !(await hasCommits(cwd))) {
    return undefined
  }

  let commit: string
  let dirty: boolean
  try {
    commit = await headSha(cwd)
    dirty = !(await isWorkingTreeClean(cwd))
  } catch {
    return undefined
  }

  let attempt = 1
  try {
    const runs = await store.list()
    attempt = runs.filter((run) => run.version?.commit === commit).length + 1
  } catch {
    // An unreadable history costs the count, not the commit.
  }

  return dirty ? { commit, dirty, attempt } : { commit, attempt }
}
