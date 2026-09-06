import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * An image that has been decoded, downscaled and re-encoded in the browser,
 * ready to be sent somewhere that charges by the byte.
 */
export type PreparedImage = {
  /** Base64 with no `data:` prefix — what an agent attachment and most APIs take. */
  data: string
  /** The same bytes as a `data:` URL, for an `<img src>` preview. */
  dataUrl: string
  mediaType: PreparedImageType
  /** Dimensions after the downscale, not of the original file. */
  width: number
  height: number
  /** Decoded size of `data` in bytes — what the request body will cost. */
  bytes: number
  /** The file the user chose, in case the caller wants its name or original size. */
  file: File
}

export type PreparedImageType = 'image/jpeg' | 'image/png' | 'image/webp'

export type PrepareImageOptions = {
  /** Longest edge of the result, in CSS pixels. Default 1024. */
  maxEdge?: number
  /** JPEG/WebP quality, 0–1. Ignored for PNG. Default 0.8. */
  quality?: number
  /** Default 'image/jpeg' — the only one of the three that is small AND universal. */
  mediaType?: PreparedImageType
}

const DEFAULT_MAX_EDGE = 1024
const DEFAULT_QUALITY = 0.8

/**
 * The scale arithmetic, split out because it is the only part worth testing and
 * the only part that runs without a DOM.
 *
 * Never scales up: a 400px photo stays 400px rather than being interpolated into
 * a blurry 1024px one that costs six times as much to send.
 */
export const fitWithin = (
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } => {
  const longest = Math.max(width, height)
  if (!Number.isFinite(longest) || longest <= 0) {
    throw new Error('That image has no readable dimensions.')
  }
  const scale = Math.min(1, maxEdge / longest)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Decode a file to something `drawImage` accepts.
 *
 * `createImageBitmap` is the fast path and the one phones take. `imageOrientation`
 * is passed explicitly because the default was 'none' for years before the spec
 * changed to 'from-image': without it a portrait photo arrives on its side, which
 * costs a vision model accuracy for no reason at all.
 *
 * The `<img>` fallback covers browsers with no `createImageBitmap` and the decodes
 * it refuses — most often an iPhone HEIC picked out of the library rather than
 * taken with the camera, which Safari will happily decode through an element.
 */
const decode = async (file: File): Promise<CanvasImageSource & { width: number; height: number }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    // Safe to revoke here: the element holds its own decoded copy, and the
    // caller draws from that rather than re-fetching the URL.
    URL.revokeObjectURL(url)
  }
}

/**
 * Downscale and re-encode an image file entirely in the browser.
 *
 * A phone camera frame is several megabytes and every byte is paid for more than
 * once — the upload, whatever row it is stored in, and a model's context window.
 * A vision model reads a 1024px JPEG as well as it reads a 12MP one, so this runs
 * before the bytes ever leave the device rather than after.
 */
export const prepareImage = async (
  file: File,
  options: PrepareImageOptions = {},
): Promise<PreparedImage> => {
  const mediaType = options.mediaType ?? 'image/jpeg'
  const quality = options.quality ?? DEFAULT_QUALITY
  const source = await decode(file)
  const size = fitWithin(source.width, source.height, options.maxEdge ?? DEFAULT_MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot resize the photo.')
  context.drawImage(source, 0, 0, size.width, size.height)
  // Free the decoded bitmap now rather than at the next GC — on a phone this is
  // tens of megabytes and the preview is about to allocate more.
  if ('close' in source && typeof source.close === 'function') source.close()

  const dataUrl = canvas.toDataURL(mediaType, quality)
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return {
    data,
    dataUrl,
    mediaType,
    width: size.width,
    height: size.height,
    // Base64 carries 3 bytes in every 4 characters, less the '=' padding.
    bytes: Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0),
    file,
  }
}

export type UsePhotoCaptureOptions = PrepareImageOptions & {
  /** `accept` for the file dialog. Default 'image/*'. */
  accept?: string
  onPhoto?: (photo: PreparedImage) => void
  onError?: (error: Error) => void
}

export type OpenPhotoPickerOptions = {
  /**
   * Ask for the rear camera instead of the photo library. Phones honour this and
   * open the camera directly; desktop browsers ignore it and show a file dialog,
   * which is exactly what you want when testing on a laptop.
   */
  camera?: boolean
}

export type UsePhotoCaptureResult = {
  photo: PreparedImage | null
  error: Error | null
  /** True between choosing a file and the downscale finishing. */
  preparing: boolean
  open: (options?: OpenPhotoPickerOptions) => void
  clear: () => void
}

/**
 * Take or choose a photo, downscaled and base64-encoded, with no markup to write.
 *
 * The file input is created on demand and thrown away again rather than returned
 * as props to render: a hidden input plus a ref plus a change handler is the same
 * fifteen lines in every app that has ever needed this, and none of them are
 * interesting. Call `open()` from your own button.
 *
 * ```tsx
 * const { photo, open, preparing } = usePhotoCapture({ maxEdge: 1024 })
 * <Button onClick={() => open({ camera: true })}>Take a photo</Button>
 * {photo ? <img src={photo.dataUrl} /> : null}
 * ```
 */
export const usePhotoCapture = (options: UsePhotoCaptureOptions = {}): UsePhotoCaptureResult => {
  const [photo, setPhoto] = useState<PreparedImage | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [preparing, setPreparing] = useState(false)

  // Read through a ref so a caller passing an inline options object does not
  // rebuild `open` on every render.
  const latest = useRef(options)
  latest.current = options

  // A picker opened and then abandoned when the component unmounts must not call
  // setState on the way back.
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const open = useCallback((openOptions: OpenPhotoPickerOptions = {}) => {
    const settings = latest.current
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = settings.accept ?? 'image/*'
    if (openOptions.camera) input.capture = 'environment'
    input.style.display = 'none'
    // Appended because Safari will not open a dialog for a detached input.
    document.body.appendChild(input)

    const done = () => input.remove()

    input.addEventListener('cancel', done)
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      done()
      if (!file) return
      if (live.current) {
        setError(null)
        setPreparing(true)
      }
      try {
        const prepared = await prepareImage(file, settings)
        if (live.current) setPhoto(prepared)
        settings.onPhoto?.(prepared)
      } catch (thrown) {
        const failure = thrown instanceof Error ? thrown : new Error(String(thrown))
        if (live.current) setError(failure)
        settings.onError?.(failure)
      } finally {
        if (live.current) setPreparing(false)
      }
    })

    input.click()
  }, [])

  const clear = useCallback(() => {
    setPhoto(null)
    setError(null)
  }, [])

  return { photo, error, preparing, open, clear }
}
