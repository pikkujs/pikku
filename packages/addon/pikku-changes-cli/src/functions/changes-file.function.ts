import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { changesContext, idList, nonBlank } from '../lib/changes.js'
import { dim, safe } from '@pikku/cli/addon-support'
import type { CreateChangeOutput } from '../lib/types.js'
import { LOCAL_PROJECT_ID } from '../lib/changes-local.js'
import { SPECIALISTS } from '../lib/specialists.js'

export const ChangesFileInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stageId: z.string().optional(),
  title: z.string(),
  body: z.string().optional(),
  bodyFile: z.string().optional(),
  route: z.string().optional(),
  locale: z.string().optional(),
  specialist: z.enum(SPECIALISTS).optional(),
  dependsOn: z.array(z.string()).optional(),
  backlog: z.boolean().optional(),
})

export const ChangesFileOutput = z.object({
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
export const ChangesFile = pikkuSessionlessFunc({
  description: 'File a change against a stage from outside the panel.',
  input: ChangesFileInput,
  output: ChangesFileOutput,
  func: async (_services, input) => {
    if (input.body && input.bodyFile)
      throw new CloudPreconditionError('Pass --body or --body-file, not both.')

    const { rpc, projectId } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    if (input.backlog && projectId !== LOCAL_PROJECT_ID)
      throw new PreconditionError(
        'The backlog is kept in the local changes queue; this project keeps its changes in fabric.'
      )

    const body = input.bodyFile
      ? await readFile(input.bodyFile, 'utf8')
      : input.body

    const filing = {
      stageId: input.stageId ?? 'local',
      title: nonBlank(input.title, 'Give the item a title.'),
      body: body?.trim() || undefined,
      route: input.route,
      locale: input.locale,
      specialist: input.specialist,
      dependsOn: idList(input.dependsOn),
      backlog: input.backlog ? true : undefined,
    }
    return await rpc.invoke('createChange', filing)
  },
})

export const renderChangesFile = (
  _s: unknown,
  { change }: CreateChangeOutput
): void => {
  console.log(`Filed #${safe(change.shortId)}  ${safe(change.title)}`)
  console.log(dim(`  ${safe(change.changeId)}`))
}
