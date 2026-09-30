import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { FabricPreconditionError } from '../lib/errors.js'
import {
  changeRef,
  changesContext,
  imageContentType,
  type ImageContentType,
} from '../lib/changes.js'
import { dim, safe, safeBlock } from '../lib/output.js'
import type { ReplyToChangeOutput } from '../sdk/rpc-map.gen.d.js'

export const FabricChangesReplyInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  message: z.string().trim().min(1, 'Say something — the message is empty.'),
  image: z.string().optional(),
  imageLabel: z.string().optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  authorName: z.string().optional(),
})

export const FabricChangesReplyOutput = z.object({
  message: z.any(),
})

/**
 * The third way to speak on a thread: `ask` parks the item until the filer
 * answers and `done --note` closes it, while a reply leaves the status alone —
 * for "not doing this, because…" or "blocked on X" that is not a question.
 */
export const FabricChangesReply = pikkuSessionlessFunc({
  description:
    'Say something on a change’s thread without asking or closing it.',
  input: FabricChangesReplyInput,
  output: FabricChangesReplyOutput,
  func: async (_services, input) => {
    let contentType: ImageContentType | undefined = input.contentType
    let imageBase64: string | undefined

    if (input.image) {
      const inferred = imageContentType(input.image)
      if (!inferred && !contentType)
        throw new FabricPreconditionError(
          `Cannot tell the image type from “${input.image}” — pass --content-type.`
        )
      contentType ??= inferred
      imageBase64 = (await readFile(input.image)).toString('base64')
    }

    const { rpc, projectId } = await changesContext(input.apiUrl)
    return await rpc.invoke('replyToChange', {
      ...changeRef(projectId, input.changeId),
      body: input.message,
      authorName: input.authorName ?? 'pikku-cli',
      contentType: contentType ?? 'image/png',
      imageLabel: input.imageLabel ?? 'screenshot',
      ...(imageBase64 ? { imageBase64 } : {}),
    })
  },
})

export const renderChangesReply = (
  _s: unknown,
  { message }: ReplyToChangeOutput
): void => {
  console.log('Replied — the item keeps its status.')
  console.log(dim(`  ${safeBlock(message.body)}`))
  for (const attachment of message.attachments)
    console.log(dim(`  [${safe(attachment.kind)}] ${safe(attachment.label)}`))
}
