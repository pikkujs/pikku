import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { age, changesContext } from '../lib/changes.js'
import { dim, keyValue, statusColor } from '../lib/output.js'
import type { GetChangeOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesShowInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
})

export const FabricChangesShowOutput = z.object({
  change: z.any(),
  thread: z.any(),
  stageUrl: z.string().nullable(),
})

export const FabricChangesShow = pikkuSessionlessFunc({
  description: 'Read one change with its thread and its circled elements.',
  input: FabricChangesShowInput,
  output: FabricChangesShowOutput,
  func: async (_services, input) => {
    const { rpc } = await changesContext(input.apiUrl)
    return await rpc.invoke('getChange', { changeId: input.changeId })
  },
})

type Change = GetChangeOutput['change']
type Message = GetChangeOutput['thread'][number]

export const renderChangesShow = (
  _s: unknown,
  {
    change,
    thread,
    stageUrl,
  }: { change: Change; thread: Message[]; stageUrl: string | null }
): void => {
  console.log(`#${change.shortId}  ${change.title}`)
  console.log(
    `${statusColor(change.status)}${change.held ? dim(' (held)') : ''}  ${dim(change.changeId)}`
  )
  if (change.body) {
    console.log('')
    console.log(change.body)
  }

  const rows: [string, string][] = []
  if (change.route)
    rows.push([
      'route',
      `${change.route}${stageUrl ? dim(`  (${stageUrl})`) : ''}`,
    ])
  if (change.gitSha) rows.push(['filed at', change.gitSha])
  if (change.viewport)
    rows.push([
      'viewport',
      `${change.viewport.width}×${change.viewport.height}`,
    ])
  if (change.screenshotUrl) rows.push(['screenshot', change.screenshotUrl])

  let anchored = false
  for (const element of change.capture?.elements ?? []) {
    const asOf = change.gitSha ? ` as of ${change.gitSha}` : ''
    const addresses = [
      element.sourceAnchor ? `${element.sourceAnchor}${asOf}` : null,
      element.testId ? `testid ${element.testId}` : null,
      element.cssPath,
    ].filter((address): address is string => !!address)
    if (!addresses.length) continue
    anchored ||= !!element.sourceAnchor
    rows.push([
      'circled',
      `${addresses[0]}${element.text ? dim(`  “${element.text}”`) : ''}`,
    ])
    for (const fallback of addresses.slice(1)) rows.push(['', dim(fallback)])
  }
  if (rows.length) {
    console.log('')
    console.log(keyValue(rows))
  }
  if (anchored && change.gitSha) {
    console.log(
      dim(
        `The anchored line is where it was at ${change.gitSha} — find today's equivalent.`
      )
    )
  }

  for (const message of thread) {
    console.log('')
    console.log(
      `${message.authorName ?? message.authorKind} ${dim(`· ${age(message.createdAt)} ago`)}`
    )
    console.log(`  ${message.body}`)
    for (const attachment of message.attachments) {
      console.log(
        `  ${dim(`[${attachment.kind}]`)} ${attachment.label}${attachment.url ? dim(`  ${attachment.url}`) : ''}`
      )
    }
    if (message.chosenOption) console.log(`  picked: ${message.chosenOption}`)
  }
}
