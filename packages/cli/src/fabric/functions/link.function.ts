import { z } from 'zod'
import chalk from 'chalk'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext, writeProjectConfig } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { assertDeploySafety, getRemoteUrl } from '../lib/git.js'
import { added, dim, keyValue } from '../lib/output.js'

export const FabricLinkInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricLinkOutput = z.object({
  projectSlug: z.string(),
  deploymentId: z.string(),
  stageId: z.string(),
  branch: z.string(),
})

export const renderFabricLink = (
  _s: unknown,
  { projectSlug, deploymentId, branch }: z.infer<typeof FabricLinkOutput>
): void => {
  console.log(added('✓') + ' project linked')
  console.log(
    keyValue([
      ['project', chalk.bold(projectSlug)],
      ['branch', branch],
      ['deploy', dim(deploymentId)],
    ])
  )
}

const GITHUB_POLL_INTERVAL_MS = 2000
const GITHUB_POLL_TIMEOUT_MS = 5 * 60 * 1000

export const FabricLink = pikkuSessionlessFunc({
  description:
    'Register the current git repo as a fabric project and queue an initial deploy.',
  input: FabricLinkInput,
  output: FabricLinkOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token) {
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    }

    const remoteUrl = await getRemoteUrl()
    const safety = await assertDeploySafety()

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    // Only check GitHub App installation for github.com repos.
    // Gitea (local dev) and other hosts use shared tokens — no App needed.
    const isGithub = /github\.com/i.test(remoteUrl)
    if (isGithub) {
      const ghInstall = await rpc.invoke('checkGithubInstall', {})
      if (!ghInstall.installed) {
        if (!ghInstall.installUrl) {
          throw new Error(
            'GitHub App is not configured on this fabric deployment.'
          )
        }
        console.log('')
        console.log(dim('  GitHub App not installed. Connect GitHub to continue:'))
        console.log('')
        console.log(`    ${chalk.bold(ghInstall.installUrl)}`)
        console.log('')
        console.log(dim('  Waiting for GitHub App installation…'))
        const deadline = Date.now() + GITHUB_POLL_TIMEOUT_MS
        let installed = false
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, GITHUB_POLL_INTERVAL_MS))
          const check = await rpc.invoke('checkGithubInstall', {})
          if (check.installed) {
            installed = true
            console.log(added('  ✓') + ` GitHub connected (${check.accountLogin})`)
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

    const project = await rpc.invoke('importProject', { repoUrl: remoteUrl })

    await writeProjectConfig(process.cwd(), {
      projectId: project.projectId,
      ...(apiUrlOverride ? { apiUrl: apiUrlOverride } : {}),
    })

    const deploy = await rpc.invoke('deployByStageKind', {
      projectId: project.projectId,
      branch: safety.branch,
      expectedHeadSha: safety.headSha,
    })

    return {
      projectSlug: project.projectSlug,
      deploymentId: deploy.deploymentId,
      stageId: deploy.stageId,
      branch: safety.branch,
    }
  },
})
