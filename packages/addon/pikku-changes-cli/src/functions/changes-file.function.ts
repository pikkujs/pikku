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
  MAX_CLONE_PAGES,
  bodyWithPages,
  declaredPages,
  filingOrder,
  parsePlanText,
  validatePlan,
} from '../lib/change-plan.js'
import { isCloneProject } from '../lib/page-reference.js'
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
  pages: z.string().optional(),
})

/**
 * A builder of a parallel loop (PIKKU_CHANGES_BUILDER=1 and
 * PIKKU_CHANGES_PARALLEL=1) that files a change mid-build puts it in the
 * backlog: scope grown after the plan was made waits for a person to make it
 * ready, rather than being picked up by another builder alongside. A serial
 * builder files to ready, as before, and the next agent builds it.
 * PIKKU_CHANGES_BUILDER_FILE_READY=1 lets a parallel builder file to ready.
 */
export const builderFilesToBacklog = (
  projectId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean =>
  env.PIKKU_CHANGES_BUILDER === '1' &&
  env.PIKKU_CHANGES_PARALLEL === '1' &&
  env.PIKKU_CHANGES_BUILDER_FILE_READY !== '1' &&
  projectId === LOCAL_PROJECT_ID

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

    const text = input.bodyFile
      ? await readFile(input.bodyFile, 'utf8')
      : input.body
    const body = await withPagesLine(text, input.pages)

    const filing = {
      stageId: input.stageId ?? 'local',
      title: nonBlank(input.title ?? '', 'Give the item a title.'),
      body: body?.trim() || undefined,
      route: input.route,
      locale: input.locale,
      specialist: input.specialist,
      dependsOn: idList(input.dependsOn),
      backlog:
        input.backlog || builderFilesToBacklog(projectId) ? true : undefined,
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
    ['title', 'body', 'bodyFile', 'specialist', 'dependsOn', 'pages'] as const
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
      backlog:
        input.backlog || builderFilesToBacklog(projectId) ? true : undefined,
    }
    const { change } = await rpc.invoke('createChange', filing)
    ids.set(planned.ref, change.changeId)
    filed.push({ ref: planned.ref, change })
  }
  return { filed }
}

/**
 * `--pages /a,/b`: the body as filed with its `Pages:` line, the pages done
 * holds the change to. In a clone project at most MAX_CLONE_PAGES, as in a plan.
 */
export async function withPagesLine(
  body: string | undefined,
  pages: string | undefined,
  clone?: boolean
): Promise<string | undefined> {
  if (pages === undefined) return body
  const list = [
    ...new Set(
      pages
        .split(',')
        .map((page) => page.trim())
        .filter(Boolean)
    ),
  ]
  if (!list.length)
    throw new CloudPreconditionError(
      '--pages names no page: give route paths, comma separated, e.g. --pages /,/about.'
    )
  const bad = list.filter((page) => !page.startsWith('/'))
  if (bad.length)
    throw new CloudPreconditionError(
      `--pages takes route paths starting with /: ${bad.join(', ')}.`
    )
  if (declaredPages(body).length)
    throw new CloudPreconditionError(
      'The body already has a Pages: line; give the pages once, in the body or with --pages.'
    )
  clone ??= isCloneProject(
    await git(['rev-parse', '--show-toplevel'])
      .then((out) => out.trim())
      .catch(() => process.cwd())
  )
  if (clone && list.length > MAX_CLONE_PAGES)
    throw new CloudPreconditionError(
      `--pages names ${list.length} pages. This project rebuilds an existing site, so a change builds at most ${MAX_CLONE_PAGES} pages, each compared with the original: file the rest as further changes.`
    )
  const text = body?.trim()
  return `${text ? `${text}\n\n` : ''}Pages: ${list.join(', ')}`
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

const BACKLOGGED =
  'Filed to the backlog, not ready: a change filed while building waits for a person to make it ready (pikku changes ready <id>). Finish the change you are on; do not build this one now.'

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
    if (
      filed.some((f) => f.change.status === 'backlog') &&
      process.env.PIKKU_CHANGES_BUILDER === '1'
    )
      console.log(BACKLOGGED)
    console.log(
      `Filing is complete: ${filed.length} change(s) filed. Stop now: do not claim, build or mark anything done; another agent builds them.`
    )
    return
  }
  console.log(`Filed #${safe(change.shortId)}  ${safe(change.title)}`)
  console.log(dim(`  ${safe(change.changeId)}`))
  if (change.status === 'backlog' && process.env.PIKKU_CHANGES_BUILDER === '1')
    console.log(BACKLOGGED)
}
