import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { promptConfirm } from '../lib/prompt.js'
import { resolveStage } from '../lib/stage.js'

export const FabricSecretsDeleteInput = z.object({
  name: z.string(),
  branch: z.string().optional(),
  force: z.boolean().optional(),
})

export const FabricSecretsDeleteOutput = z.object({
  name: z.string(),
  runId: z.string().nullable(),
  deploymentId: z.string().nullable(),
})

export const FabricSecretsDelete = pikkuSessionlessFunc({
  description:
    'Remove a single stage-scoped secret. Unlike `secrets rotate`, the rest of the stage keeps its sealing key and its other secrets.',
  input: FabricSecretsDeleteInput,
  output: FabricSecretsDeleteOutput,
  func: async (_services, { name, branch: requested, force }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    // Resolved before the prompt so the confirmation names the stage that
    // would actually lose the secret, not an argument that may be absent.
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    if (!force) {
      if (!process.stdin.isTTY) {
        throw new Error(
          `Refusing to delete ${name} from ${branch} without confirmation — re-run with --force to delete non-interactively.`
        )
      }
      // Fabric cannot read the sealed value back, so this is not recoverable
      // by re-reading it — the plaintext has to be supplied again.
      if (
        !(await promptConfirm(
          `Delete ${name} from ${branch}? It cannot be recovered — the value must be set again.`
        ))
      ) {
        throw new Error('Delete aborted.')
      }
    }

    const result = await rpc.invoke('deleteStageSecret', { stageId, name })

    console.log(`[fabric] deleted ${result.name} from ${branch}`)
    if (result.runId) {
      console.log(
        `[fabric] republishing the stage as run ${result.runId} — units serve the old value until it lands`
      )
    } else {
      console.log(
        '[fabric] deploy the stage to stop its units serving the old value'
      )
    }
    return result
  },
})
