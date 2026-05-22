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
    console.log(`[fabric] queued deploy: branch=${safety.branch} deploymentId=${deploy.deploymentId}`)

    return {
      projectSlug: project.projectSlug,
      deploymentId: deploy.deploymentId,
      stageId: deploy.stageId,
    }
  },
})
