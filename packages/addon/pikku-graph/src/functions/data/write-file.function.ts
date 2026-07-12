import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const WriteFileInput = z.object({
  bucket: z
    .string()
    .optional()
    .describe('Storage bucket (defaults to the content service root bucket)'),
  key: z.string().describe('Asset key / path to write the file to'),
  data: z.string().describe('File contents, decoded according to `encoding`'),
  encoding: z
    .enum(['utf8', 'base64'])
    .optional()
    .describe('How `data` is encoded (default utf8)'),
})

export const WriteFileOutput = z.object({
  bucket: z.string().describe('Bucket the file was written to'),
  assetKey: z.string().describe('Asset key of the written file'),
})

export const writeFile = pikkuSessionlessFunc({
  description: 'Write file contents to content storage from the workflow',
  node: { displayName: 'Write File', category: 'Files', type: 'action' },
  input: WriteFileInput,
  output: WriteFileOutput,
  func: async ({ content }, { bucket, key, data, encoding }) => {
    const resolvedBucket = bucket ?? ''
    const bytes = new Uint8Array(Buffer.from(data, encoding ?? 'utf8'))
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    await content!.writeFile({ bucket: resolvedBucket, key, stream })
    return { bucket: resolvedBucket, assetKey: key }
  },
})
