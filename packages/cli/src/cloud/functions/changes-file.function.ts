import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { CloudPreconditionError } from '../lib/errors.js'
import { changesContext, idList, nonBlank } from '../lib/changes.js'
import { dim, safe } from '../lib/output.js'
import type { CreateChangeOutput } from '../sdk/rpc-map.gen.d.js'
import { SPECIALISTS } from '../lib/specialists.js'

export const CloudChangesFileInput = z.object({
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
})

export const CloudChangesFileOutput = z.object({
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
export const CloudChangesFile = pikkuSessionlessFunc({
  description: 'File a change against a stage from outside the panel.',
  input: CloudChangesFileInput,
  output: CloudChangesFileOutput,
  func: async (_services, input) => {
    if (input.body && input.bodyFile)
      throw new CloudPreconditionError('Pass --body or --body-file, not both.')

    const { rpc } = await changesContext(input.apiUrl, input.projectId)

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
