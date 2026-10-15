import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import {
  changeRef,
  changesContext,
  imageContentType,
  type ImageContentType,
  nonBlank,
} from '../lib/changes.js'
import { dim, safe, safeBlock } from '@pikku/cli/addon-support'
import type { ReplyToChangeInput, ReplyToChangeOutput } from '../lib/types.js'
import { LOCAL_PROJECT_ID } from '../lib/changes-local.js'

export const ChangesReplyInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  message: z.string(),
  image: z.string().optional(),
  imageLabel: z.string().optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  authorName: z.string().optional(),
  person: z.boolean().optional(),
})

export const ChangesReplyOutput = z.object({
  message: z.any(),
})

/**
 * The third way to speak on a thread: `ask` parks the item until the filer
 * answers and `done --note` closes it, while a reply leaves the status alone —
 * for "not doing this, because…" or "blocked on X" that is not a question.
 */
export const ChangesReply = pikkuSessionlessFunc({
  description:
    'Say something on a change’s thread without asking or closing it.',
  input: ChangesReplyInput,
  output: ChangesReplyOutput,
  func: async (_services, input) => {
    let contentType: ImageContentType | undefined = input.contentType
    let imageBase64: string | undefined

    if (input.image) {
      const inferred = imageContentType(input.image)
      if (!inferred && !contentType)
        throw new CloudPreconditionError(
          `Cannot tell the image type from “${input.image}” — pass --content-type.`
        )
      contentType ??= inferred
      imageBase64 = (await readFile(input.image)).toString('base64')
    }

    const { rpc, projectId } = await changesContext(input.apiUrl)
    if (input.person && projectId !== LOCAL_PROJECT_ID)
      throw new CloudPreconditionError(
        'A person answers a hosted project from the console; --person is for the local changes queue.'
      )
    const reply: ReplyToChangeInput & { person?: boolean } = {
      ...changeRef(projectId, input.changeId),
      body: nonBlank(input.message, 'Say something — the message is empty.'),
      authorName: input.authorName ?? 'pikku-cli',
      contentType: contentType ?? 'image/png',
      imageLabel: input.imageLabel ?? 'screenshot',
      ...(imageBase64 ? { imageBase64 } : {}),
      ...(input.person ? { person: true } : {}),
    }
    return await rpc.invoke('replyToChange', reply)
  },
})

export const renderChangesReply = (
  _s: unknown,
  { message }: ReplyToChangeOutput
): void => {
  console.log(
    message.authorKind === 'user'
      ? 'Answered — a parked change is back in progress.'
      : 'Replied — the item keeps its status; a parked change stays parked until the person answers.'
  )
  console.log(dim(`  ${safeBlock(message.body)}`))
  for (const attachment of message.attachments)
    console.log(dim(`  [${safe(attachment.kind)}] ${safe(attachment.label)}`))
}
