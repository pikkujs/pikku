import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const SplitTextInput = z.object({
  text: z.string().describe('The text to split into chunks'),
  strategy: z
    .enum(['recursive', 'character', 'token'])
    .optional()
    .describe(
      'Splitting strategy: recursive (paragraph→line→word hierarchy, default), character (single separator), or token (approximate token budget)'
    ),
  chunkSize: z
    .number()
    .min(1)
    .optional()
    .describe(
      'Maximum size of each chunk (characters, or tokens for the token strategy; default 1000)'
    ),
  chunkOverlap: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Amount of overlap carried between consecutive chunks (default 200)'
    ),
  separator: z
    .string()
    .optional()
    .describe('Separator for the character strategy (default "\\n\\n")'),
})

export const SplitTextOutput = z.object({
  chunks: z.array(z.string()).describe('The resulting text chunks'),
})

type Input = z.infer<typeof SplitTextInput>
type Output = z.infer<typeof SplitTextOutput>

const RECURSIVE_SEPARATORS = ['\n\n', '\n', ' ', '']
const CHARS_PER_TOKEN = 4

/**
 * Merge a list of pieces (already split on `separator`) into chunks no larger
 * than `chunkSize`, carrying `chunkOverlap` worth of trailing pieces into the
 * next chunk. Mirrors LangChain's `mergeSplits`.
 */
function mergeSplits(
  splits: string[],
  separator: string,
  chunkSize: number,
  chunkOverlap: number
): string[] {
  const chunks: string[] = []
  const current: string[] = []
  let total = 0
  const sepLen = separator.length

  const currentLength = () => {
    if (current.length === 0) return 0
    const contentLen = current.reduce((sum, piece) => sum + piece.length, 0)
    return contentLen + sepLen * (current.length - 1)
  }

  for (const piece of splits) {
    if (piece.length === 0) continue
    const addedLen = piece.length + (current.length > 0 ? sepLen : 0)
    if (total + addedLen > chunkSize && current.length > 0) {
      chunks.push(current.join(separator))
      while (
        current.length > 0 &&
        (total > chunkOverlap || (total + addedLen > chunkSize && total > 0))
      ) {
        const removed = current.shift() as string
        total -= removed.length + (current.length > 0 ? sepLen : 0)
      }
    }
    current.push(piece)
    total = currentLength()
  }

  if (current.length > 0) chunks.push(current.join(separator))
  return chunks
}

function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  const [separator, ...rest] = separators.length ? separators : ['']

  const pieces = separator === '' ? text.split('') : text.split(separator)

  const finalChunks: string[] = []
  let goodSplits: string[] = []

  const flush = () => {
    if (goodSplits.length > 0) {
      finalChunks.push(
        ...mergeSplits(goodSplits, separator, chunkSize, chunkOverlap)
      )
      goodSplits = []
    }
  }

  for (const piece of pieces) {
    if (piece.length <= chunkSize) {
      goodSplits.push(piece)
    } else {
      flush()
      if (rest.length > 0) {
        finalChunks.push(
          ...recursiveSplit(piece, rest, chunkSize, chunkOverlap)
        )
      } else {
        finalChunks.push(piece)
      }
    }
  }
  flush()
  return finalChunks
}

export const splitText = pikkuSessionlessFunc({
  description:
    'Split text into overlapping chunks for embedding/RAG (recursive, character, or token strategy)',
  node: { displayName: 'Split Text', category: 'Transform', type: 'action' },
  input: SplitTextInput,
  output: SplitTextOutput,
  func: async (_services, data: Input): Promise<Output> => {
    const strategy = data.strategy ?? 'recursive'
    const chunkOverlap = data.chunkOverlap ?? 200
    const requestedSize = data.chunkSize ?? 1000

    if (data.text.length === 0) return { chunks: [] }

    let chunks: string[]
    if (strategy === 'character') {
      const separator = data.separator ?? '\n\n'
      chunks = mergeSplits(
        separator === '' ? data.text.split('') : data.text.split(separator),
        separator,
        requestedSize,
        chunkOverlap
      )
    } else {
      const chunkSize =
        strategy === 'token' ? requestedSize * CHARS_PER_TOKEN : requestedSize
      const overlap =
        strategy === 'token' ? chunkOverlap * CHARS_PER_TOKEN : chunkOverlap
      chunks = recursiveSplit(
        data.text,
        RECURSIVE_SEPARATORS,
        chunkSize,
        Math.min(overlap, chunkSize - 1)
      )
    }

    return { chunks: chunks.filter((c) => c.length > 0) }
  },
})
