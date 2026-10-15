import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStageId } from '../lib/stage.js'
import { table, dim } from '@pikku/cli/addon-support'
import { PreconditionError } from '@pikku/cli/addon-support'

export const CloudDbSchemaInput = z.object({
  branch: z.string().default('main'),
})

export const CloudDbSchemaOutput = z.object({
  branch: z.string(),
  schema: z.any(),
})

export const CloudDbSchema = pikkuSessionlessFunc({
  description: 'Show the live database schema (tables + columns) for a branch',
  input: CloudDbSchemaInput,
  output: CloudDbSchemaOutput,
  func: async (_services, { branch }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new PreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new PreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
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
    console.log(
      dim(`No schema for ${branch} (stage may have no database yet).`)
    )
    return
  }
  console.log(
    table(
      ['TABLE', 'COLUMNS'],
      tables.map((t) => [t.name, t.columns.length])
    )
  )
}
