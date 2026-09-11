import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext } from '../lib/changes.js'
import { dim } from '../lib/output.js'
import type { AttachChangeShotOutput } from '../sdk/rpc-map.gen.d.js'

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
} as const

type ContentType = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES]

export const FabricChangesShotInput = z.object({
  apiUrl: z.string().optional(),
  changeId: z.string(),
  label: z.string(),
  image: z.string().optional(),
  imageBase64: z.string().optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  kind: z.enum(['option', 'evidence']).optional(),
  authorName: z.string().optional(),
})

export const FabricChangesShotOutput = z.object({
  message: z.any(),
  key: z.string(),
})

/**
 * `--image <path>` rather than only the raw base64 the API takes: this command
 * runs on the machine that rendered the variant, so making the caller shell out
 * to `base64` puts a multi-megabyte argument on the command line for no reason.
 */
export const FabricChangesShot = pikkuSessionlessFunc({
  description: 'Attach a rendered option or a piece of evidence to a change.',
  input: FabricChangesShotInput,
  output: FabricChangesShotOutput,
  func: async (_services, input) => {
    if (!input.image && !input.imageBase64)
      throw new Error('Pass --image <path> or --image-base64 <data>.')

    let contentType: ContentType | undefined = input.contentType
    let imageBase64 = input.imageBase64

    if (input.image) {
      const extension = extname(input.image).toLowerCase()
      const inferred = CONTENT_TYPES[extension as keyof typeof CONTENT_TYPES]
      if (!inferred && !contentType)
        throw new Error(
          `Cannot tell the image type from “${input.image}” — pass --content-type.`
        )
      contentType ??= inferred
      imageBase64 = (await readFile(input.image)).toString('base64')
    }

    const { rpc } = await changesContext(input.apiUrl)
    return await rpc.invoke('attachChangeShot', {
      changeId: input.changeId,
      label: input.label,
      kind: input.kind ?? 'option',
      contentType: contentType ?? 'image/png',
      imageBase64: imageBase64!,
      authorName: input.authorName ?? 'pikku-cli',
    })
  },
})

export const renderChangesShot = (
  _s: unknown,
  { message, key }: AttachChangeShotOutput
): void => {
  const count = message.attachments.length
  console.log(
    `Attached — the item now offers ${count} option${count === 1 ? '' : 's'} in the panel.`
  )
  console.log(dim(`key ${key}`))
}
