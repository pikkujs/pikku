import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { changesContext, idList, nonBlank } from '../lib/changes.js'
import { dim, safe } from '@pikku/cli/addon-support'
import type { CreateChangeOutput } from '../lib/types.js'
import { LOCAL_PROJECT_ID } from '../lib/changes-local.js'
import { SPECIALISTS } from '../lib/specialists.js'
import {
  bodyWithPages,
  filingOrder,
  parsePlanText,
  validatePlan,
} from '../lib/change-plan.js'
import { isCloneProject } from '../lib/page-gate.js'
import { git } from '@pikku/cli/addon-support'

export const ChangesFileInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stageId: z.string().optional(),
  title: z.string().optional(),
  plan: z.string().optional(),
  body: z.string().optional(),
  bodyFile: z.string().optional(),
  route: z.string().optional(),
  locale: z.string().optional(),
  specialist: z.enum(SPECIALISTS).optional(),
  dependsOn: z.array(z.string()).optional(),
  backlog: z.boolean().optional(),
})

export const ChangesFileOutput = z.object({
  change: z.any().optional(),
  filed: z.array(z.object({ ref: z.string(), change: z.any() })).optional(),
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
    if (input.plan !== undefined) return await filePlan(input)
    if (input.body && input.bodyFile)
      throw new CloudPreconditionError('Pass --body or --body-file, not both.')

    const { rpc, projectId } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    if (input.backlog && projectId !== LOCAL_PROJECT_ID)
      throw new CloudPreconditionError(
        'The backlog is kept in the local changes queue; this project keeps its changes in Pikku Studio Cloud.'
      )

    const body = input.bodyFile
      ? await readFile(input.bodyFile, 'utf8')
      : input.body

    const filing = {
      stageId: input.stageId ?? 'local',
      title: nonBlank(input.title ?? '', 'Give the item a title.'),
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

/**
 * `--plan` files every change of a plan in one call, or none: the plan is
 * checked whole before the first change is written, and each `dependsOn` ref
 * becomes the real id of a change filed earlier in the same call.
 */
async function filePlan(
  input: z.infer<typeof ChangesFileInput>
): Promise<z.infer<typeof ChangesFileOutput>> {
  const single = (
    ['title', 'body', 'bodyFile', 'specialist', 'dependsOn'] as const
  ).filter((key) => input[key] !== undefined)
  if (single.length)
    throw new CloudPreconditionError(
      `--plan files the whole plan from its JSON; drop ${single.map((k) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).join(', ')}.`
    )
  const source = input.plan === '-' ? 'stdin' : input.plan!
  const text =
    input.plan === '-' ? await readStdin() : await readPlanFile(input.plan!)
  const top = await git(['rev-parse', '--show-toplevel'])
    .then((out) => out.trim())
    .catch(() => process.cwd())
  const plan = validatePlan(parsePlanText(text, source), {
    clone: isCloneProject(top),
  })

  const { rpc, projectId } = await changesContext(input.apiUrl, input.projectId)
  if (input.backlog && projectId !== LOCAL_PROJECT_ID)
    throw new CloudPreconditionError(
      'The backlog is kept in the local changes queue; this project keeps its changes in Pikku Studio Cloud.'
    )
  const ids = new Map<string, string>()
  const filed: Array<{ ref: string; change: CreateChangeOutput['change'] }> = []
  for (const planned of filingOrder(plan)) {
    const filing = {
      stageId: input.stageId ?? 'local',
      title: planned.title,
      body: bodyWithPages(planned),
      route: input.route,
      locale: input.locale,
      specialist: planned.specialist,
      dependsOn: planned.dependsOn.length
        ? planned.dependsOn.map((ref) => ids.get(ref)!)
        : undefined,
      backlog: input.backlog ? true : undefined,
    }
    const { change } = await rpc.invoke('createChange', filing)
    ids.set(planned.ref, change.changeId)
    filed.push({ ref: planned.ref, change })
  }
  return { filed }
}

async function readPlanFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    throw new CloudPreconditionError(
      `The plan was not filed: cannot read ${path} (${(error as NodeJS.ErrnoException).code ?? (error as Error).message}).`
    )
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

export const renderChangesFile = (
  _s: unknown,
  { change, filed }: z.infer<typeof ChangesFileOutput>
): void => {
  if (filed) {
    for (const { ref, change } of filed) {
      const tagged = change as { dependsOn?: string[]; specialist?: string }
      const deps = tagged.dependsOn ?? []
      const after = deps.length
        ? `  (after ${deps.map((id) => `#${safe(filed.find((f) => f.change.changeId === id)?.change.shortId ?? id)}`).join(', ')})`
        : ''
      console.log(
        `Filed #${safe(change.shortId)}  ${safe(ref)}  ${safe(tagged.specialist ?? '')}  ${safe(change.title)}${after}`
      )
    }
    console.log(
      `Filing is complete: ${filed.length} change(s) filed. Stop now: do not claim, build or mark anything done; another agent builds them.`
    )
    return
  }
  console.log(`Filed #${safe(change.shortId)}  ${safe(change.title)}`)
  console.log(dim(`  ${safe(change.changeId)}`))
}
