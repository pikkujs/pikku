import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { resolveStageId } from '../lib/stage.js'
import { table, dim } from '../lib/output.js'

export const FabricDbSchemaInput = z.object({
  branch: z.string().default('main'),
})

export const FabricDbSchemaOutput = z.object({
  branch: z.string(),
  schema: z.any(),
})

export const FabricDbSchema = pikkuSessionlessFunc({
  description: 'Show the live database schema (tables + columns) for a branch',
  input: FabricDbSchemaInput,
  output: FabricDbSchemaOutput,
  func: async (_services, { branch }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error('No fabric project linked. Run `pikku fabric link` first.')

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const stageId = await resolveStageId(rpc, ctx.projectId, branch)
    const { schema } = await rpc.invoke('getStageDatabaseSchema', { stageId })
    return { branch, schema }
  },
})

type Schema = { tables?: { name: string; columns: unknown[] }[] } | null

export const renderDbSchema = (
  _s: unknown,
  { branch, schema }: { branch: string; schema: Schema }
): void => {
  const tables = schema?.tables ?? []
  if (tables.length === 0) {
    console.log(dim(`No schema for ${branch} (stage may have no database yet).`))
    return
  }
  console.log(
    table(
      ['TABLE', 'COLUMNS'],
      tables.map((t) => [t.name, t.columns.length])
    )
  )
}
