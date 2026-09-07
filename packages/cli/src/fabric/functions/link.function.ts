import { z } from 'zod'
import { basename } from 'node:path'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext, writeProjectConfig } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import {
  addRemote,
  assertDeploySafety,
  currentBranch,
  getRemoteUrl,
  hasCommits,
  hasRemote,
  isWorkingTreeClean,
  pushWithCredential,
  removeRemote,
} from '../lib/git.js'
import { promptConfirm } from '../lib/prompt.js'

export const FabricLinkInput = z.object({
  apiUrl: z.string().optional(),
  /** Assert the project lives on GitHub. */
  github: z.boolean().optional(),
  /** Assert — or, with no `origin`, request — a repo on Fabric's git server. */
  gitea: z.boolean().optional(),
  /** Name for a repo created here. Defaults to the directory name. */
  repoName: z.string().optional(),
})

export const FabricLinkOutput = z.object({
  projectId: z.string(),
  projectSlug: z.string(),
  deploymentId: z.string(),
  stageId: z.string(),
})

const GITHUB_POLL_INTERVAL_MS = 2000
const GITHUB_POLL_TIMEOUT_MS = 5 * 60 * 1000

/** github.com or not. Everything else Fabric supports is reached the Gitea way. */
const isGithubUrl = (url: string): boolean => /github\.com/i.test(url)

export const FabricLink = pikkuSessionlessFunc({
  description:
    'Register the current git repo as a fabric project and queue an initial deploy.',
  input: FabricLinkInput,
  output: FabricLinkOutput,
  func: async (_services, { apiUrl: apiUrlOverride, github, gitea, repoName }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token) {
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    }

    if (github && gitea) {
      throw new Error(
        '--github and --gitea name two different places to keep one repo. Pass one, or neither to use whatever `origin` already points at.'
      )
    }

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    // Both of these are checked BEFORE anything is created. `assertDeploySafety`
    // below covers them too, but it runs after the repo exists — and refusing to
    // link because of a dirty tree, having already provisioned a repo the user
    // now has to clean up, is a worse answer than refusing first.
    if (!(await hasCommits())) {
      throw new Error(
        'Nothing to link: this repository has no commits yet. Commit your work first — fabric deploys a pushed commit, not a working directory.'
      )
    }
    if (!(await isWorkingTreeClean())) {
      throw new Error(
        'Deployment blocked: uncommitted changes detected.\nCommit and push your changes before deploying.'
      )
    }

    const remoteUrl = (await hasRemote())
      ? await adoptExistingRemote({ github, gitea })
      : await createRemote({ rpc, github, gitea, repoName })

    const safety = await assertDeploySafety()

    // Only check GitHub App installation for github.com repos.
    // Gitea (local dev) and other hosts use shared tokens — no App needed.
    if (isGithubUrl(remoteUrl)) {
      const ghInstall = await rpc.invoke('checkGithubInstall', {})
      if (!ghInstall.installed) {
        if (!ghInstall.installUrl) {
          throw new Error(
            'GitHub App is not configured on this fabric deployment.'
          )
        }
        console.log('')
        console.log('  GitHub App not installed. Connect GitHub to continue:')
        console.log('')
        console.log(`    ${ghInstall.installUrl}`)
        console.log('')
        console.log('  Waiting for GitHub App installation...')
        const deadline = Date.now() + GITHUB_POLL_TIMEOUT_MS
        let installed = false
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, GITHUB_POLL_INTERVAL_MS))
          const check = await rpc.invoke('checkGithubInstall', {})
          if (check.installed) {
            installed = true
            console.log(`  GitHub connected (${check.accountLogin})`)
            break
          }
        }
        if (!installed) {
          throw new Error(
            'Timed out waiting for GitHub App installation. Run `pikku fabric link` again after installing.'
          )
        }
      }
    }

    const project = await rpc.invoke('importProject', {
      repoUrl: remoteUrl,
      productionBranch: 'main',
    })

    await writeProjectConfig(process.cwd(), {
      projectId: project.projectId,
      ...(apiUrlOverride ? { apiUrl: apiUrlOverride } : {}),
    })
    console.log(
      `[fabric] linked ${project.projectSlug} projectId=${project.projectId}`
    )

    const deploy = await rpc.invoke('deployByStageKind', {
      projectId: project.projectId,
      branch: safety.branch,
      expectedHeadSha: safety.headSha,
    })
    console.log(
      `[fabric] queued deploy: branch=${safety.branch} deploymentId=${deploy.deploymentId}`
    )

    return {
      projectId: project.projectId,
      projectSlug: project.projectSlug,
      deploymentId: deploy.deploymentId,
      stageId: deploy.stageId,
    }
  },
})

/**
 * The common case: `origin` exists, so that is the repo, whichever host it is on.
 *
 * The flags are read as ASSERTIONS here rather than as instructions. `--gitea`
 * against a github.com origin could plausibly mean "move this to Fabric's git
 * server", but re-pointing somebody's `origin` is not something a link command
 * should decide on its own — so it is a question, answered by an error that says
 * what to do instead.
 */
async function adoptExistingRemote({
  github,
  gitea,
}: {
  github?: boolean
  gitea?: boolean
}): Promise<string> {
  const remoteUrl = await getRemoteUrl()
  const onGithub = isGithubUrl(remoteUrl)

  if (github && !onGithub) {
    throw new Error(
      `--github was passed, but origin is ${remoteUrl}, which is not on github.com.\nDrop the flag to link that remote, or repoint origin at the GitHub repo you meant.`
    )
  }
  if (gitea && onGithub) {
    throw new Error(
      `--gitea was passed, but origin is already ${remoteUrl}.\nDrop the flag to link the GitHub repo. To host it on fabric instead, remove the remote first (\`git remote remove origin\`) and run link again.`
    )
  }
  return remoteUrl
}

/**
 * No `origin` — the case `link` used to fail on with a bare "no such remote".
 *
 * Fabric creates the repo on its own git server and pushes to it, then the
 * caller carries on down the ordinary import path. It does NOT create GitHub
 * repos: doing that on the user's behalf needs a separate consent (a device-flow
 * authorization against their GitHub account), and the Fabric GitHub App cannot
 * stand in for it without asking every existing installation to re-approve an
 * `administration: write` permission.
 *
 * Nothing here happens unasked. Without a flag the user is asked, and a session
 * with nobody at the terminal is told which flag to pass instead of hanging on a
 * prompt no one will answer.
 */
async function createRemote({
  rpc,
  github,
  gitea,
  repoName,
}: {
  rpc: ReturnType<typeof getFabricRPC>
  github?: boolean
  gitea?: boolean
  repoName?: string
}): Promise<string> {
  if (github) {
    throw new Error(
      'There is no `origin` to link, and fabric cannot create a GitHub repository for you.\nCreate it on github.com, `git remote add origin <url>`, and run `pikku fabric link` again — or pass --gitea to host it on fabric instead.'
    )
  }

  if (!gitea) {
    if (!process.stdin.isTTY) {
      throw new Error(
        'There is no `origin` to link.\nPass --gitea to create a repository on fabric and push to it, or add a remote yourself and run link again.'
      )
    }
    const confirmed = await promptConfirm(
      'This project has no git remote. Create one on fabric and push this branch to it?',
      true
    )
    if (!confirmed) {
      throw new Error(
        'Nothing linked. Add a remote yourself (`git remote add origin <url>`) and run `pikku fabric link` again.'
      )
    }
  }

  const name = repoName ?? basename(process.cwd())
  const branch = await currentBranch()

  const repo = await rpc.invoke('provisionRepo', { name })
  console.log(`[fabric] created ${repo.repoUrl}`)

  await addRemote('origin', repo.cloneUrl)
  try {
    await pushWithCredential('origin', branch, repo)
  } catch (error) {
    // Leave no half-linked repository behind. The remote is ours — added a line
    // ago — so removing it is safe, and it is what stops a retry dying on
    // "remote origin already exists" instead of on the real problem.
    await removeRemote('origin')
    throw new Error(
      `Created ${repo.repoUrl} but could not push to it: ${
        error instanceof Error ? error.message : String(error)
      }\nThe repository exists and is empty; push to it yourself, or run link again to get a fresh one.`
    )
  }
  console.log(`[fabric] pushed ${branch} to origin`)

  return repo.repoUrl
}
