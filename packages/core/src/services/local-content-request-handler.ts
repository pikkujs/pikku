import { createReadStream } from 'fs'
import { mkdir, stat, writeFile } from 'fs/promises'
import { normalize, resolve } from 'path'
import { Readable } from 'stream'
import type { JWTService, Logger } from '@pikku/core/services'
import { signedContentPath, type LocalContentConfig } from './local-content.js'

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

/**
 * Resolve a key against the content root, or `null` if it escapes. `normalize`
 * first so `..` segments are collapsed before the prefix check, and the
 * comparison carries a trailing separator so a sibling directory whose name
 * merely starts with the root's cannot pass as being inside it.
 */
const toTargetPath = (basePath: string, key: string): string | null => {
  const normalizedBasePath = resolve(basePath)
  const targetPath = resolve(normalizedBasePath, normalize(key))
  return targetPath.startsWith(`${normalizedBasePath}/`) ? targetPath : null
}

const parseSizeLimit = (sizeLimit: string): number => {
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i.exec(sizeLimit.trim())
  if (!match) {
    throw new Error(`Invalid size limit: ${sizeLimit}`)
  }
  const value = Number(match[1])
  const unit = (match[2] ?? 'b').toLowerCase()
  const multiplier =
    unit === 'gb'
      ? 1024 * 1024 * 1024
      : unit === 'mb'
        ? 1024 * 1024
        : unit === 'kb'
          ? 1024
          : 1
  return value * multiplier
}

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

export const createLocalContentRequestHandler = ({
  content,
  logger,
  getJWT,
}: LocalContentRequestHandlerOptions): LocalContentRequestHandler => {
  // Logged at most once. An unverifiable request is attacker-triggerable, so
  // this reports a startup misconfiguration rather than per-request news.
  let loggedMissingJWT = false

  const validateSignedAssetRequest = async (
    requestUrl: URL
  ): Promise<{ ok: true } | { ok: false; status: number; body: string }> => {
    const signedAtValue = requestUrl.searchParams.get('signedAt')
    const expiresAtValue = requestUrl.searchParams.get('expiresAt')
    const notBeforeValue = requestUrl.searchParams.get('notBefore')
    const signature = requestUrl.searchParams.get('signature')

    if (!signedAtValue || !expiresAtValue) {
      return { ok: false, status: 403, body: 'Signed URL required' }
    }

    const signedAt = Number(signedAtValue)
    const expiresAt = Number(expiresAtValue)
    const notBefore =
      notBeforeValue == null ? undefined : Number(notBeforeValue)

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

    const jwt = getJWT()
    if (!jwt) {
      if (!loggedMissingJWT) {
        loggedMissingJWT = true
        logger.error(
          'pikku: refusing signed asset reads — no JWTService is available to verify them. Pass `contentSigningJWT` (the same service LocalContent signs with) or expose it as `singletonServices.jwt`.'
        )
      }
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

  const handleUpload = async (
    request: Request,
    pathname: string
  ): Promise<Response> => {
    const key = contentKey(pathname, content.uploadUrlPrefix)
    const targetPath = toTargetPath(content.localFileUploadPath, key)
    if (!targetPath) {
      return text(400, 'Invalid path')
    }

    const maxBytes = parseSizeLimit(content.sizeLimit ?? '1mb')
    const body = Buffer.from(await request.arrayBuffer())
    // Checked after buffering rather than while streaming: `Request` has already
    // read the body by the time it can be measured. Runtimes that want to reject
    // early should cap the body at the transport.
    if (body.length > maxBytes) {
      return text(413, 'Content too large')
    }

    await mkdir(resolve(targetPath, '..'), { recursive: true })
    await writeFile(targetPath, body)
    return new Response(null, { status: 200 })
  }

  const handleAsset = async (
    request: Request,
    requestUrl: URL,
    pathname: string
  ): Promise<Response> => {
    const key = contentKey(pathname, content.assetUrlPrefix)
    const targetPath = toTargetPath(content.localFileUploadPath, key)
    if (!targetPath) {
      return text(400, 'Invalid path')
    }

    const signed = await validateSignedAssetRequest(requestUrl)
    if (!signed.ok) {
      return text(signed.status, signed.body)
    }

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
      return handleUpload(request, pathname)
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
