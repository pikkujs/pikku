import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext, writeProjectConfig } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { assertDeploySafety, getRemoteUrl } from '../lib/git.js'

export const FabricLinkInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricLinkOutput = z.object({
  projectSlug: z.string(),
  deploymentId: z.string(),
  stageId: z.string(),
})

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

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })

    // Ensure GitHub App is installed before importing
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

    const project = await rpc.invoke('importProject', { repoUrl: remoteUrl })

    await writeProjectConfig(process.cwd(), {
      projectId: project.projectSlug,
      ...(apiUrlOverride ? { apiUrl: apiUrlOverride } : {}),
    })
    console.log(`[fabric] linked ${project.projectSlug}`)

    const deploy = await rpc.invoke('deployByStageKind', {
      projectId: project.projectSlug,
      branch: safety.branch,
      expectedHeadSha: safety.headSha,
    })
    console.log(
      `[fabric] queued deploy: branch=${safety.branch} deploymentId=${deploy.deploymentId}`
    )

    return {
      projectSlug: project.projectSlug,
      deploymentId: deploy.deploymentId,
      stageId: deploy.stageId,
    }
  },
})
