import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { age, changesContext } from '../lib/changes.js'
import { dim, keyValue, safe, statusColor } from '../lib/output.js'
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
  console.log(`#${safe(change.shortId)}  ${safe(change.title)}`)
  console.log(
    `${statusColor(change.status)}${change.held ? dim(' (held)') : ''}  ${dim(safe(change.changeId))}`
  )
  if (change.body) {
    console.log('')
    console.log(safe(change.body))
  }

  const rows: [string, string][] = []
  if (change.route)
    rows.push([
      'route',
      `${safe(change.route)}${stageUrl ? dim(`  (${safe(stageUrl)})`) : ''}`,
    ])
  if (change.gitSha) rows.push(['filed at', safe(change.gitSha)])
  if (change.viewport)
    rows.push([
      'viewport',
      `${change.viewport.width}×${change.viewport.height}`,
    ])
  if (change.screenshotUrl)
    rows.push(['screenshot', safe(change.screenshotUrl)])

  let anchored = false
  for (const element of change.capture?.elements ?? []) {
    const asOf = change.gitSha ? ` as of ${safe(change.gitSha)}` : ''
    const addresses = [
      element.sourceAnchor ? `${safe(element.sourceAnchor)}${asOf}` : null,
      element.testId ? `testid ${safe(element.testId)}` : null,
      element.cssPath ? safe(element.cssPath) : null,
    ].filter((address): address is string => !!address)
    if (!addresses.length) continue
    anchored ||= !!element.sourceAnchor
    rows.push([
      'circled',
      `${addresses[0]}${element.text ? dim(`  “${safe(element.text)}”`) : ''}`,
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
        `The anchored line is where it was at ${safe(change.gitSha)} — find today's equivalent.`
      )
    )
  }

  for (const message of thread) {
    console.log('')
    console.log(
      `${safe(message.authorName ?? message.authorKind)} ${dim(`· ${age(message.createdAt)} ago`)}`
    )
    console.log(`  ${safe(message.body)}`)
    for (const attachment of message.attachments) {
      console.log(
        `  ${dim(`[${safe(attachment.kind)}]`)} ${safe(attachment.label)}${attachment.url ? dim(`  ${safe(attachment.url)}`) : ''}`
      )
    }
    if (message.chosenOption)
      console.log(`  picked: ${safe(message.chosenOption)}`)
  }
}
