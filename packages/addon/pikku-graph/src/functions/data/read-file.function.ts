import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ReadFileInput = z.object({
  bucket: z
    .string()
    .optional()
    .describe('Storage bucket (defaults to the content service root bucket)'),
  key: z.string().describe('Asset key / path of the file to read'),
  encoding: z
    .enum(['utf8', 'base64'])
    .optional()
    .describe('How to decode the file bytes into `data` (default utf8)'),
})

export const ReadFileOutput = z.object({
  data: z
    .string()
    .describe('File contents decoded with the requested encoding'),
  bucket: z.string().describe('Bucket the file was read from'),
  key: z.string().describe('Asset key that was read'),
})

export const readFile = pikkuSessionlessFunc({
  description: 'Read a file from content storage into the workflow',
  node: { displayName: 'Read File', category: 'Files', type: 'action' },
  input: ReadFileInput,
  output: ReadFileOutput,
  func: async ({ content }, { bucket, key, encoding }) => {
    const resolvedBucket = bucket ?? ''
    const buffer = await content!.readFileAsBuffer({
      bucket: resolvedBucket,
      key,
    })
    return {
      data: buffer.toString(encoding ?? 'utf8'),
      bucket: resolvedBucket,
      key,
    }
  },
})
