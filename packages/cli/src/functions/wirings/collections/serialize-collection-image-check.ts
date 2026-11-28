/**
 * The part of the generated runtime that looks at an uploaded image before a
 * record takes its key. An upload URL only carries what the caller declared, so
 * the stored file is what has to be measured and recognised.
 *
 * It is written without template literals and escapes, so it reads here as it
 * does in the project.
 */
export const COLLECTION_IMAGE_CHECK = String.raw`/** What is kept of a file while it streams past: its ends, never the whole. */
const COLLECTION_HEAD_BYTES = 256
const COLLECTION_TAIL_BYTES = 12

interface CollectionFile {
  size: number
  head: Uint8Array
  tail: Uint8Array
  /** The file is a whole run of ISO media boxes, as an AVIF is. */
  boxed: boolean
}

const collectionAscii = (bytes: ArrayLike<number>, from: number, to: number): string =>
  String.fromCharCode(...Array.from(bytes).slice(from, to))

const collectionUint32 = (bytes: ArrayLike<number>, at: number): number =>
  bytes[at]! * 16777216 + bytes[at + 1]! * 65536 + bytes[at + 2]! * 256 + bytes[at + 3]!

const collectionStartsWith = (file: CollectionFile, expected: number[]): boolean =>
  expected.every((byte, index) => file.head[index] === byte)

const collectionEndsWith = (file: CollectionFile, expected: number[]): boolean =>
  file.tail.length >= expected.length &&
  expected.every(
    (byte, index) => file.tail[file.tail.length - expected.length + index] === byte
  )

/** Follows the box headers of an ISO media file, skipping what they hold. */
const collectionBoxes = () => {
  const found = new Set<string>()
  let header: number[] = []
  let skip = 0
  let broken = false
  return {
    take(chunk: Uint8Array) {
      let at = 0
      while (at < chunk.length && !broken) {
        if (skip > 0) {
          const step = Math.min(skip, chunk.length - at)
          skip -= step
          at += step
          continue
        }
        header.push(chunk[at++]!)
        if (header.length < 8) continue
        let size = collectionUint32(header, 0)
        if (size === 1) {
          if (header.length < 16) continue
          size = collectionUint32(header, 8) * 4294967296 + collectionUint32(header, 12)
        }
        if (size < header.length) {
          broken = true
        } else {
          found.add(collectionAscii(header, 4, 8))
          skip = size - header.length
          header = []
        }
      }
    },
    whole: () =>
      !broken &&
      skip === 0 &&
      header.length === 0 &&
      found.has('mdat') &&
      (found.has('meta') || found.has('moov')),
  }
}

/**
 * How each type is recognised: how it begins, and that it is all there, by the
 * end its format requires or the length it states. This does not decode the
 * image, so it does not show that the whole of it is sound or harmless.
 */
const COLLECTION_IMAGE_FORMATS: Record<string, (file: CollectionFile) => boolean> = {
  'image/png': (file) =>
    collectionStartsWith(file, [137, 80, 78, 71, 13, 10, 26, 10]) &&
    collectionAscii(file.head, 12, 16) === 'IHDR' &&
    collectionEndsWith(file, [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]),
  'image/jpeg': (file) =>
    collectionStartsWith(file, [255, 216, 255]) && collectionEndsWith(file, [255, 217]),
  'image/gif': (file) =>
    ['GIF87a', 'GIF89a'].includes(collectionAscii(file.head, 0, 6)) &&
    file.size > 13 &&
    collectionEndsWith(file, [59]),
  'image/webp': (file) =>
    file.size > 20 &&
    collectionAscii(file.head, 0, 4) === 'RIFF' &&
    collectionAscii(file.head, 8, 12) === 'WEBP' &&
    // The length of the file, little end first.
    collectionUint32([file.head[7]!, file.head[6]!, file.head[5]!, file.head[4]!], 0) + 8 ===
      file.size,
  'image/avif': (file) => {
    if (collectionAscii(file.head, 4, 8) !== 'ftyp' || !file.boxed) return false
    const end = Math.min(collectionUint32(file.head, 0), file.head.length)
    // The major brand, then past the version, the compatible ones.
    for (let at = 8; at + 4 <= end; at += at === 8 ? 8 : 4) {
      if (['avif', 'avis'].includes(collectionAscii(file.head, at, at + 4))) return true
    }
    return false
  },
}

/** Reads a stored file as a stream, and stops as soon as it is too large. */
const collectionReadFile = async (
  stream: AsyncIterable<Uint8Array>,
  maxBytes: number
): Promise<CollectionFile> => {
  const head = new Uint8Array(COLLECTION_HEAD_BYTES)
  let tail: number[] = []
  let size = 0
  const boxes = collectionBoxes()
  // Leaving the loop early closes the stream.
  for await (const chunk of stream) {
    if (size < COLLECTION_HEAD_BYTES) {
      head.set(chunk.subarray(0, COLLECTION_HEAD_BYTES - size), size)
    }
    size += chunk.length
    if (size > maxBytes) {
      throw new UnprocessableContentError(
        'The uploaded file is larger than this field takes'
      )
    }
    tail = [...tail, ...chunk.subarray(-COLLECTION_TAIL_BYTES)].slice(-COLLECTION_TAIL_BYTES)
    boxes.take(chunk)
  }
  return {
    size,
    head: head.subarray(0, Math.min(size, COLLECTION_HEAD_BYTES)),
    tail: Uint8Array.from(tail),
    boxed: boxes.whole(),
  }
}

export interface CollectionImageRules {
  maxBytes: number
  /** The types the field takes, with the extension a key of each ends in. */
  extensions: Record<string, string>
}

/**
 * A record only takes the key of a file that has been uploaded, is no larger
 * than the field takes, and is the image its key says: one of the field's types,
 * from its first bytes to its end. A refused file stays in storage.
 */
export const collectionUploaded = async (
  content: ContentService | undefined,
  bucket: string,
  key: string | null | undefined,
  { maxBytes, extensions }: CollectionImageRules
): Promise<void> => {
  if (typeof key !== 'string') return
  const storage = collectionContent(content)
  const found = await storage.listFilesByPrefix(bucket, key, 'private')
  if (!found.includes(key)) {
    throw new UnprocessableContentError(
      'No file has been uploaded under this key'
    )
  }
  const type = Object.keys(extensions).find((candidate) =>
    key.endsWith('.' + extensions[candidate])
  )
  const recognises =
    type && Object.hasOwn(COLLECTION_IMAGE_FORMATS, type)
      ? COLLECTION_IMAGE_FORMATS[type]
      : undefined
  if (!recognises) {
    throw new UnprocessableContentError('This kind of file cannot be verified')
  }
  const stream = await storage.readFile({ bucket, key, visibility: 'private' })
  const file = await collectionReadFile(
    stream as AsyncIterable<Uint8Array>,
    maxBytes
  )
  if (!recognises(file)) {
    throw new UnprocessableContentError(
      'The uploaded file is not a complete image of the type it was uploaded as'
    )
  }
}
`
