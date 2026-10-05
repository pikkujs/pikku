import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import type { JWTService, Logger } from '@pikku/core/services'
import {
  UploadTooLargeError,
  parseContentSizeLimit,
  resolveContentRequestTarget,
  signedContentPath,
  streamUploadToFile,
  type LocalContentConfig,
} from './local-content.js'

/**
 * The server half of {@link LocalContent}.
 *
 * `LocalContent` hands out `PUT <uploadUrlPrefix>/<key>` upload URLs and signed
 * `GET <assetUrlPrefix>/<key>` read URLs, but it cannot answer either: it is a
 * `ContentService`, not a transport. Something in the serving path has to, and
 * until now only `@pikku/node-http-server` did — so the very same project served
 * under Bun handed the browser upload URLs that 404ed, with nothing naming the
 * cause.
 *
 * Expressed in Web `Request`/`Response` so every runtime can share one
 * implementation rather than each re-deriving the signature check. Returns
 * `null` for anything that is not a content request, which is the caller's
 * signal to carry on with its normal routing.
 */
export type LocalContentRequestHandler = (
  request: Request
) => Promise<Response | null>

export type LocalContentRequestHandlerOptions = {
  content: LocalContentConfig
  logger: Logger
  /**
   * Resolved per request rather than passed by value: a runtime may only be
   * able to reach the signing service through `singletonServices`, which is not
   * populated until after the server is constructed.
   */
  getJWT: () => JWTService | undefined
}

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const contentKey = (pathname: string, prefix: string) =>
  pathname.slice(prefix.length).replace(/^\/+/, '')

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

export type SignedContentVerification =
  { ok: true } | { ok: false; status: number; body: string }

/**
 * Verifies a signed content URL — the one function that decides whether a
 * signed read or a signed upload is genuine.
 *
 * Exported and shared so the runtimes that serve content (the core handler here,
 * the node server, the express adapter) verify identically. They used to each
 * carry their own copy, which is how the express upload path ended up with no
 * check at all: one copy can rot or be forgotten in isolation.
 *
 * `onMissingJWT` is called at most where the caller wants to log the
 * misconfiguration once; a signed request with no verifier is treated as
 * invalid, never as trusted.
 */
export const verifySignedContentRequest = async (
  requestUrl: URL,
  jwt: JWTService | undefined,
  onMissingJWT?: () => void
): Promise<SignedContentVerification> => {
  const signedAtValue = requestUrl.searchParams.get('signedAt')
  const expiresAtValue = requestUrl.searchParams.get('expiresAt')
  const notBeforeValue = requestUrl.searchParams.get('notBefore')
  const signature = requestUrl.searchParams.get('signature')

  if (!signedAtValue || !expiresAtValue) {
    return { ok: false, status: 403, body: 'Signed URL required' }
  }

  const signedAt = Number(signedAtValue)
  const expiresAt = Number(expiresAtValue)
  const notBefore = notBeforeValue == null ? undefined : Number(notBeforeValue)

  if (
    !Number.isFinite(signedAt) ||
    !Number.isFinite(expiresAt) ||
    (notBefore != null && !Number.isFinite(notBefore))
  ) {
    return { ok: false, status: 403, body: 'Invalid signed URL' }
  }

  const now = Date.now()
  if (now > expiresAt || (notBefore != null && now < notBefore)) {
    return { ok: false, status: 403, body: 'Signed URL expired' }
  }

  if (!jwt) {
    onMissingJWT?.()
    return { ok: false, status: 403, body: 'Invalid signed URL' }
  }

  if (!signature) {
    return { ok: false, status: 403, body: 'Signed URL signature required' }
  }

  try {
    const payload = await jwt.decode<{
      signedAt?: number
      expiresAt?: number
      notBefore?: number
      path?: string
    }>(signature)

    // Every claim is compared, the path included: without it a signature
    // minted for one asset would read any other.
    if (
      payload.signedAt !== signedAt ||
      payload.expiresAt !== expiresAt ||
      payload.notBefore !== notBefore ||
      payload.path !== signedContentPath(requestUrl.pathname)
    ) {
      return { ok: false, status: 403, body: 'Invalid signed URL' }
    }
  } catch {
    return { ok: false, status: 403, body: 'Invalid signed URL' }
  }

  return { ok: true }
}

export const createLocalContentRequestHandler = ({
  content,
  logger,
  getJWT,
}: LocalContentRequestHandlerOptions): LocalContentRequestHandler => {
  // Logged at most once. An unverifiable request is attacker-triggerable, so
  // this reports a startup misconfiguration rather than per-request news.
  let loggedMissingJWT = false

  const validateSignedAssetRequest = (
    requestUrl: URL
  ): Promise<SignedContentVerification> =>
    verifySignedContentRequest(requestUrl, getJWT(), () => {
      if (loggedMissingJWT) return
      loggedMissingJWT = true
      logger.error(
        'pikku: refusing signed asset reads — no JWTService is available to verify them. Pass `contentSigningJWT` (the same service LocalContent signs with) or expose it as `singletonServices.jwt`.'
      )
    })

  const handleUpload = async (
    request: Request,
    requestUrl: URL,
    pathname: string
  ): Promise<Response> => {
    // Uploads are presigned exactly like reads: getUploadURL mints a signed URL
    // and this verifies it before writing. Without this an unauthenticated PUT
    // could write arbitrary bytes to any key under the content root — the write
    // side had none of the signature checking the read side has always had.
    const signed = await validateSignedAssetRequest(requestUrl)
    if (!signed.ok) {
      return text(signed.status, signed.body)
    }

    const key = contentKey(pathname, content.uploadUrlPrefix)
    const target = await resolveContentRequestTarget(
      content.localFileUploadPath,
      key,
      'write'
    )
    if (!target) {
      return text(400, 'Invalid path')
    }

    try {
      await streamUploadToFile(
        request.body
          ? Readable.fromWeb(request.body as never)
          : (async function* () {})(),
        target.path,
        parseContentSizeLimit(content.sizeLimit ?? '1mb')
      )
    } catch (error) {
      if (error instanceof UploadTooLargeError) {
        return text(413, 'Content too large')
      }
      throw error
    }
    return new Response(null, { status: 200 })
  }

  const handleAsset = async (
    request: Request,
    requestUrl: URL,
    pathname: string
  ): Promise<Response> => {
    const key = contentKey(pathname, content.assetUrlPrefix)
    const target = await resolveContentRequestTarget(
      content.localFileUploadPath,
      key,
      'read'
    )
    if (!target) {
      return text(400, 'Invalid path')
    }

    if (target.visibility === 'private') {
      const signed = await validateSignedAssetRequest(requestUrl)
      if (!signed.ok) {
        return text(signed.status, signed.body)
      }
    }
    const targetPath = target.path

    try {
      const file = await stat(targetPath)
      if (!file.isFile()) {
        return new Response(null, { status: 404 })
      }

      const headers = {
        'content-length': String(file.size),
        'content-type': 'application/octet-stream',
      }
      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers })
      }
      // Streamed rather than buffered: assets are user uploads, and their size
      // is bounded by `sizeLimit` at write time, not by anything here.
      return new Response(
        Readable.toWeb(createReadStream(targetPath)) as ReadableStream,
        { status: 200, headers }
      )
    } catch {
      return new Response(null, { status: 404 })
    }
  }

  return async (request) => {
    let requestUrl: URL
    try {
      requestUrl = new URL(request.url)
    } catch {
      return null
    }

    const pathname = decodeURIComponent(requestUrl.pathname)

    if (
      request.method === 'PUT' &&
      matchesPrefix(pathname, content.uploadUrlPrefix)
    ) {
      return handleUpload(request, requestUrl, pathname)
    }

    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      matchesPrefix(pathname, content.assetUrlPrefix)
    ) {
      return handleAsset(request, requestUrl, pathname)
    }

    return null
  }
}
