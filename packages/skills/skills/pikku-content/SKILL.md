---
name: pikku-content
description: >-
  Files in an app: upload, photo, image, document, PDF, attachment, avatar, receipt, download link, `content`, getUploadURL, getDownloadURL, readFileAsBuffer. Open before a function takes a file as input. Who may read one is pikku-permissions; a model reading one is pikku-agent.
installGroups: [core]
---

# Pikku Content

Run this once: `pikku doc ContentService UploadURLResult`. It prints each step as real code. The service is `content` on `services`, never `contentService`.

## The rule

**A file goes straight from the client to a signed URL, never through a function as base64 or JSON.** A function only hands out the URL and saves the key.

## Upload, in order

1. A function calls `content.getUploadURL({ bucket, fileKey, contentType })` and returns `uploadUrl`, `uploadMethod`, `uploadHeaders` and `fileKey`. A bucket is any name you pick. Build `fileKey` on the server: owner prefix, uuid, sanitised file name.
2. The browser sends the file itself, as the raw body, with no `FormData` and no session token, because the URL is the grant:

   `fetch(new URL(uploadUrl, serverUrl), { method: uploadMethod ?? 'PUT', headers: { 'Content-Type': file.type, ...uploadHeaders }, body: file })`

   `uploadUrl` may be relative, so always resolve it. Check `ok`. The URL is short-lived, so ask just before sending. The browser must send from the server's own origin: `fetch` from any other origin fails, so a page served elsewhere proxies the upload route.
3. A second function saves the key. It came from the client, so check its owner prefix and that `content.listFilesByPrefix(bucket, fileKey)` includes it.

## Save the key

Store `fileKey` on the row. Not a URL, which expires. Not the file. Not `assetKey`.

## Reading

Private unless you pass `visibility: 'public'`. Read through `content.getDownloadURL({ bucket, key, expiresInSeconds })`: a signed URL, minted per view, for an `<img>` or a link.

Anyone holding it can read the file, so the function handing it out decides who may. **The functions that sign an upload, save a key or sign a read each take an id, so each gets a `pikkuPermission` that loads that row.** A check in the body, or a signed-in check alone, does not count.

Public and private are separate stores: pass the same `visibility` on every call, or a public file answers 404.

## Not checked for you

`getUploadURL` checks neither `contentType` nor `size`: allow types with a `z.enum` on the input. The largest upload is `content.sizeLimit` in pikku.config.json, default `1mb`, then 413: raise it for phone photos.

`writeFile`, `copyFile` and `deleteFile` return `false` on failure instead of throwing.

## An agent reading a file

`content.readFileAsBuffer({ bucket, key })`, then `attachments: [{ type: 'image', data: buffer.toString('base64'), mediaType }]` on `rpc.agent.run`; `type: 'file'` for a PDF. Base64 only here, server-side.
