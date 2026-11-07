/**
 * File access for this verifier's scripts goes through the `content` service
 * (lint.enforceContentService). A LocalContent rooted at `root` stores files
 * under `<root>/private/<bucket>/<key>`; `ingest` copies an existing file in
 * so scripts can read files they did not write (generated output, fixtures).
 */
import { Readable } from 'node:stream'
import { LocalContent } from '@pikku/core/services/local-content'
import type { JWTService, Logger } from '@pikku/core/services'

const logger = {
  info() {},
  warn() {},
  error(...args: unknown[]) {
    console.error(...args)
  },
  debug() {},
} as unknown as Logger

const noJwt: JWTService = {
  encode: async () => {
    throw new Error('script content does not sign URLs')
  },
  decode: async () => {
    throw new Error('script content does not sign URLs')
  },
}

export const createScriptContent = (root: string) =>
  new LocalContent(
    {
      localFileUploadPath: root,
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/assets',
    },
    logger,
    noJwt
  )

export const putText = async (
  content: LocalContent,
  bucket: string,
  key: string,
  text: string | Uint8Array
): Promise<void> => {
  const ok = await content.writeFile({
    bucket,
    key,
    stream: Readable.from([
      typeof text === 'string' ? Buffer.from(text) : text,
    ]),
  })
  if (!ok) throw new Error(`could not write ${bucket}/${key}`)
}

export const getText = async (
  content: LocalContent,
  bucket: string,
  key: string
): Promise<string> =>
  (await content.readFileAsBuffer({ bucket, key })).toString('utf-8')

export const hasKey = async (
  content: LocalContent,
  bucket: string,
  key: string
): Promise<boolean> =>
  (await content.listFilesByPrefix(bucket, key)).includes(key)

/** Reads a file that already exists on disk by copying it into the store. */
export const ingestText = async (
  content: LocalContent,
  absolutePath: string
): Promise<string> => {
  const key = absolutePath.replace(/^[/\\]+/, '').replace(/[:\\]/g, '_')
  const ok = await content.copyFile({
    bucket: 'ingest',
    key,
    fromAbsolutePath: absolutePath,
  })
  if (!ok) throw new Error(`could not read ${absolutePath}`)
  return getText(content, 'ingest', key)
}
