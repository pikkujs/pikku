import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { isTreeCleanBesidesProjectId } from '../lib/project-id.js'
import {
  CloudPreconditionError,
  addRemote,
  currentBranch,
  dim,
  getRemoteUrl,
  git,
  hasRemote,
  keyValue,
} from '@pikku/cli/addon-support'

export const CloudGitInput = z.object({
  apiUrl: z.string().optional(),
  /** `gitea`, `github`, or the URL of a repo that already exists. */
  moveTo: z.string().optional(),
  /** The GitHub or URL target as `owner/name` or a full URL. */
  repo: z.string().optional(),
  /** Print what Cloud would do and change nothing. */
  dryRun: z.boolean().optional(),
})

const Host = z.object({ provider: z.string(), repoUrl: z.string() })

export const CloudGitOutput = z.object({
  projectId: z.string(),
  branch: z.string().nullable(),
  current: z.object({
    provider: z.string(),
    repoUrl: z.string().nullable(),
    origin: z.string().nullable(),
  }),
  moved: z
    .object({
      dryRun: z.boolean(),
      copied: z.boolean(),
      from: Host,
      to: Host.extend({ cloneUrl: z.string() }),
      steps: z.array(z.string()),
    })
    .nullable(),
})

type SetProjectRepoTarget = 'gitea' | 'github' | 'url'

const providerOf = (url: string | null): string =>
  !url ? 'none' : /(^|[/.@])github\.com/i.test(url) ? 'github' : 'gitea'

export const resolveMoveTarget = (
  moveTo: string,
  repo?: string
): { target: SetProjectRepoTarget; repoUrl?: string } => {
  const normalized = moveTo.trim().toLowerCase()
  if (normalized === 'gitea') return { target: 'gitea' }
  if (normalized === 'github') {
    if (!repo) {
      throw new CloudPreconditionError(
        '--move-to github needs the repo to move to: pass --repo owner/name (create it on github.com first).'
      )
    }
    return {
      target: 'github',
      repoUrl: /^https?:\/\//i.test(repo)
        ? repo
        : `https://github.com/${repo.replace(/^\/+|\.git$/g, '')}`,
    }
  }
  if (/^https?:\/\//i.test(moveTo)) return { target: 'url', repoUrl: moveTo }
  throw new CloudPreconditionError(
    `Unknown --move-to "${moveTo}". Use gitea, github, or the URL of an existing repo.`
  )
}

const repointOrigin = async (cloneUrl: string): Promise<void> => {
  if (!(await hasRemote('origin'))) {
    await addRemote('origin', cloneUrl)
    return
  }
  if (!(await hasRemote('previous'))) {
    await addRemote('previous', await git(['remote', 'get-url', 'origin']))
  }
  await git(['remote', 'set-url', 'origin', cloneUrl])
}

export const CloudGit = pikkuSessionlessFunc({
  description:
    'Show where the linked project’s repo lives, or move it between GitHub and Cloud’s Gitea with --move-to. The project keeps its stages, database, secrets and domains.',
  input: CloudGitInput,
  output: CloudGitOutput,
  func: async (_services, { apiUrl: apiUrlOverride, moveTo, repo, dryRun }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token) {
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    }
    if (!ctx.projectId) {
      throw new CloudPreconditionError(
        'Not linked, run `pikku cloud link` first.'
      )
    }

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const details = await rpc.invoke('getProjectDetails', {
      projectId: ctx.projectId,
    })
    const origin = (await hasRemote('origin')) ? await getRemoteUrl() : null
    const branch = await currentBranch().catch(() => null)
    const current = {
      provider: providerOf(details.gitRepoUrl),
      repoUrl: details.gitRepoUrl,
      origin,
    }

    if (!moveTo) {
      return { projectId: ctx.projectId, branch, current, moved: null }
    }

    const { target, repoUrl } = resolveMoveTarget(moveTo, repo)

    if (!dryRun && !(await isTreeCleanBesidesProjectId())) {
      throw new CloudPreconditionError(
        'Move blocked: uncommitted changes detected.\nCommit and push your changes before moving the repo.'
      )
    }

    const result = await rpc.invoke('setProjectRepo', {
      projectId: ctx.projectId,
      target,
      ...(repoUrl ? { repoUrl } : {}),
      dryRun: Boolean(dryRun),
    })

    if (!result.dryRun) await repointOrigin(result.to.cloneUrl)

    return {
      projectId: ctx.projectId,
      branch,
      current,
      moved: {
        dryRun: result.dryRun,
        copied: result.copied,
        from: result.from,
        to: result.to,
        steps: result.steps,
      },
    }
  },
})

export const renderGit = (
  _services: unknown,
  result: z.infer<typeof CloudGitOutput>
): void => {
  const { current, moved } = result
  if (!moved) {
    console.log(
      keyValue([
        ['provider', current.provider],
        ['repo', current.repoUrl ?? dim('(none)')],
        ['origin', current.origin ?? dim('(none)')],
        ['branch', result.branch ?? dim('(none)')],
      ])
    )
    return
  }
  for (const step of moved.steps) console.log(step)
  if (moved.dryRun) {
    console.log(dim('Dry run: nothing was changed.'))
    return
  }
  console.log(
    `Moved ${moved.from.provider} → ${moved.to.provider}: ${moved.to.repoUrl} (${
      moved.copied ? 'Cloud copied the history' : 'Cloud verified the history'
    }). origin now points there; the old URL is the \`previous\` remote.`
  )
}
