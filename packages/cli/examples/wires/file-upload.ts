//~ name: file-upload
//~ title: File upload + view (public & private) via the `content` service
//~ when: The app lets users upload/attach files — avatars, photos, documents, images. Two backend RPCs: presign an upload URL (client PUTs the bytes straight to storage), then hand back a viewable URL. Persist the returned fileKey on your row (e.g. todo.attachmentKey). The uploader UI is a SEPARATE frontend concern — see the file-upload-ui scaffold; style it however the app needs (dropzone, button, avatar picker…).

// ===== FILE: packages/functions/src/lib/file-keys.ts =====
//~ One bucket groups related files. `content` is the injected pikku ContentService —
//~ LocalContent in the sandbox (files on disk, served at /upload + /content), an
//~ R2/S3-backed one in a deployed stage. It is ALWAYS injected: never guard it, and
//~ never report it as unconfigured just because services.ts does not name it.
export const BUCKET = 'uploads'

//~ keyGeneration — build a safe, namespaced storage key. PRIVATE files live under the
//~ owner's userId so one user can never guess/read another's key; PUBLIC files live
//~ under `public/`. The uuid stops collisions + name-guessing. NEVER use the raw
//~ client fileName as the key — keep it only as a sanitized suffix.
export function buildFileKey(visibility: 'public' | 'private', userId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const prefix = visibility === 'public' ? 'public' : userId
  //~ Global crypto.randomUUID — works in the sandbox (bun/node) AND a deployed CF
  //~ Worker; never `import 'node:crypto'` (not resolvable on Workers).
  return `${prefix}/${crypto.randomUUID()}-${safeName}`
}

// ===== FILE: packages/functions/src/functions/request-file-upload.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { BUCKET, buildFileKey } from '../lib/file-keys.js'

export const RequestFileUploadInput = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  visibility: z.enum(['public', 'private']).default('private'),
})

export const RequestFileUploadOutput = z.object({
  //~ The client PUTs the raw file bytes to this presigned URL (use uploadMethod).
  uploadUrl: z.string(),
  //~ Persist THIS on your row — it's how you read the file back. It's bucket-less on
  //~ purpose (getFileViewUrl re-adds the bucket), so never store `assetKey` instead.
  fileKey: z.string(),
  uploadMethod: z.enum(['PUT', 'POST']).optional(),
  uploadHeaders: z.record(z.string(), z.string()).optional(),
})

export const requestFileUpload = pikkuFunc({
  expose: true,
  auth: true,
  description: 'Presign a URL to upload a file, scoped public or private to the user.',
  input: RequestFileUploadInput,
  output: RequestFileUploadOutput,
  func: async ({ content }, input, { session }) => {
    const fileKey = buildFileKey(input.visibility, session!.userId, input.fileName)
    //~ getUploadURL's uploadUrl already points at /upload/<bucket>/<fileKey>.
    const { uploadUrl, uploadMethod, uploadHeaders } = await content.getUploadURL({
      bucket: BUCKET,
      fileKey,
      contentType: input.contentType,
      visibility: input.visibility,
    })
    return { uploadUrl, fileKey, uploadMethod, uploadHeaders }
  },
})

// ===== FILE: packages/functions/src/functions/get-file-view-url.function.ts =====
import { z } from 'zod'
import { pikkuPermission } from '#pikku/auth'
import { pikkuFunc } from '#pikku/function'
import { BUCKET } from '../lib/file-keys.js'

//~ Ownership lives in `permissions`, NOT the func body. Public files are viewable by
//~ anyone; a private file is only the caller's if its key is under their userId.
export const ownsFile = pikkuPermission<{ fileKey: string; visibility: 'public' | 'private' }>(
  async (_services, { fileKey, visibility }, { session }) => {
    if (visibility === 'public') return true
    return !!session?.userId && fileKey.startsWith(`${session.userId}/`)
  },
)

export const GetFileViewUrlInput = z.object({
  fileKey: z.string().min(1),
  visibility: z.enum(['public', 'private']).default('private'),
})
export const GetFileViewUrlOutput = z.object({
  //~ A ready-to-use URL (put it straight in <img src> / a download link).
  url: z.string(),
  expiresAt: z.string(),
})

export const getFileViewUrl = pikkuFunc({
  expose: true,
  readonly: true, //~ pure read — mints a URL, never writes
  auth: true,
  permissions: { ownsFile },
  description: 'Return a viewable URL for a file — long-lived for public, short-lived for private.',
  input: GetFileViewUrlInput,
  output: GetFileViewUrlOutput,
  func: async ({ content }, input) => {
    //~ signContentKey mints a signed, time-limited URL at the /content prefix. The
    //~ sandbox's LocalContent requires a signed URL even for public reads, so BOTH
    //~ paths sign — the difference is the window: public gets a far-future expiry
    //~ (effectively a stable shareable link), private a short one. In a deployed R2
    //~ stage a truly-public file can instead be served from a public bucket, but the
    //~ signed-URL path works everywhere, so prefer it unless you need hot-linking.
    const ttlMs = input.visibility === 'public' ? 3650 * 24 * 3_600_000 : 3_600_000
    const dateLessThan = new Date(Date.now() + ttlMs)
    const url = await content.signContentKey({
      bucket: BUCKET,
      contentKey: input.fileKey,
      dateLessThan,
    })
    return { url, expiresAt: dateLessThan.toISOString() }
  },
})
