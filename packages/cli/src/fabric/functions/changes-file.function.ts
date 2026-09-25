import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { changesContext, requireProjectId } from '../lib/changes.js'
import { resolveStageId } from '../lib/stage.js'
import { dim, safe } from '../lib/output.js'
import type { CreateChangeOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesFileInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stageId: z.string().optional(),
  branch: z.string().optional(),
  title: z.string().trim().min(1, 'Give the item a title.'),
  body: z.string().optional(),
  bodyFile: z.string().optional(),
  route: z.string().optional(),
  locale: z.string().optional(),
})

export const FabricChangesFileOutput = z.object({
  change: z.any(),
})

/**
 * An item filed from a terminal carries no screenshot, no circled elements and
 * no build — the panel supplies those and nothing here can invent them. What it
 * does carry is the words, which the skill already treats as the requirement
 * and every other address as evidence, so a written item is a thinner but not a
 * malformed one.
 *
 * `--body-file` because a real item's body is a paragraph with newlines in it,
 * and putting that through shell quoting is where it gets mangled.
 */
export const FabricChangesFile = pikkuSessionlessFunc({
  description: 'File a change against a stage from outside the panel.',
  input: FabricChangesFileInput,
  output: FabricChangesFileOutput,
  func: async (_services, input) => {
    if (input.body && input.bodyFile)
      throw new FabricPreconditionError('Pass --body or --body-file, not both.')

    const { rpc, projectId } = await changesContext(
      input.apiUrl,
      input.projectId
    )

    const stageId =
      input.stageId ??
      (await resolveStageId(rpc, requireProjectId(projectId), input.branch))

    const body = input.bodyFile
      ? await readFile(input.bodyFile, 'utf8')
      : input.body

    return await rpc.invoke('createChange', {
      stageId,
      title: input.title,
      body: body?.trim() || undefined,
      route: input.route,
      locale: input.locale,
    })
  },
})

export const renderChangesFile = (
  _s: unknown,
  { change }: CreateChangeOutput
): void => {
  console.log(`Filed #${safe(change.shortId)}  ${safe(change.title)}`)
  console.log(dim(`  ${safe(change.changeId)}`))
}
