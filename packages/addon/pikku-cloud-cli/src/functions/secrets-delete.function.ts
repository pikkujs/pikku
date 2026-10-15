import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { promptConfirm } from '../lib/prompt.js'
import { resolveStage } from '../lib/stage.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

export const CloudSecretsDeleteInput = z.object({
  name: z.string(),
  branch: z.string().optional(),
  force: z.boolean().optional(),
})

export const CloudSecretsDeleteOutput = z.object({
  name: z.string(),
  runId: z.string().nullable(),
  deploymentId: z.string().nullable(),
})

export const CloudSecretsDelete = pikkuSessionlessFunc({
  description:
    'Remove a single stage-scoped secret. Unlike `secrets rotate`, the rest of the stage keeps its sealing key and its other secrets.',
  input: CloudSecretsDeleteInput,
  output: CloudSecretsDeleteOutput,
  func: async (_services, { name, branch: requested, force }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    // Resolved before the prompt so the confirmation names the stage that
    // would actually lose the secret, not an argument that may be absent.
    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    if (!force) {
      if (!process.stdin.isTTY) {
        throw new CloudPreconditionError(
          `Refusing to delete ${name} from ${branch} without confirmation — re-run with --force to delete non-interactively.`
        )
      }
      // Pikku Studio Cloud cannot read the sealed value back, so this is not recoverable
      // by re-reading it — the plaintext has to be supplied again.
      if (
        !(await promptConfirm(
          `Delete ${name} from ${branch}? It cannot be recovered — the value must be set again.`
        ))
      ) {
        throw new CloudPreconditionError('Delete aborted.')
      }
    }

    const result = await rpc.invoke('deleteStageSecret', { stageId, name })

    console.log(`[cloud] deleted ${result.name} from ${branch}`)
    if (result.runId) {
      console.log(
        `[cloud] republishing the stage as run ${result.runId} — units serve the old value until it lands`
      )
    } else {
      console.log(
        '[cloud] deploy the stage to stop its units serving the old value'
      )
    }
    return result
  },
})
