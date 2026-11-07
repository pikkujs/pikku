---
name: pikku-content
description: >-
  Files in an app: upload, photo, image, document, PDF, attachment, avatar, receipt, download link, `content`, getUploadURL, getDownloadURL, readFileAsBuffer. Open before a function takes a file as input. Who may read one is pikku-permissions; a model reading one is pikku-agent.
installGroups: [core]
---

# Pikku Content

Run this once: `pikku doc content ContentService UploadURLResult`. `content` prints one whole upload as real code: the key, the permissions, the functions, the routes and the browser. The service is `content` on `services`, never `contentService`.

## The rule

**A file goes straight from the client to a signed URL, never through a function as base64 or JSON.** A function only hands out the URL and saves the key.

## Upload, in order

The `content` service needs a backend. In `pikku dev` the built-in local store is wired for you. Anywhere else, supply a `content` singleton service (for the built-in store, `LocalContent` also needs the matching upload and asset routes), or `content.getUploadURL` has nothing to call.

1. A function calls `content.getUploadURL({ bucket, fileKey, contentType })` and returns `uploadUrl`, `uploadMethod`, `uploadHeaders` and `fileKey`. A bucket is any name you pick. Build `fileKey` on the server: owner prefix, uuid, sanitised file name.
2. The browser sends the file itself, as the raw body, with no `FormData` and no session token, because the URL is the grant. On the generated fetch client, `pikkuFetch.uploadFile(upload, file, contentType)` does this, resolves a relative `uploadUrl` and throws on failure. Without it:

   `fetch(new URL(uploadUrl, serverUrl), { method: uploadMethod ?? 'PUT', headers: { 'Content-Type': file.type, ...uploadHeaders }, body: file })`

   `uploadUrl` may be relative, so always resolve it. Check `ok`. The URL is short-lived, so ask just before sending. The server's own upload route only takes requests from its own origin. A page served elsewhere sends directly only if the upload endpoint allows that page's origin, method and headers through CORS; otherwise it proxies the upload route.
3. A second function saves the key. It came from the client, so its `pikkuPermission` checks the owner prefix and that `content.listFilesByPrefix(bucket, fileKey, visibility)` (the upload's visibility) includes it, never the body. With several checks use one group, `permissions: { owner: [isMember, ownsKey] }`: separate groups are OR'd, so one passing skips the rest. The same goes for a function that reads a key.

## Save the key

Store `fileKey` on the row. Not a URL, which expires. Not the file. Not `assetKey`.

## Reading

Private unless you pass `visibility: 'public'`. Read through `content.getDownloadURL({ bucket, key, expiresInSeconds })`: a signed, expiring URL for a private file, minted per view, for an `<img>` or a link. A `public` file gets a plain, persistent URL: `expiresInSeconds` does not expire it, so never rely on expiry to restrict a public file.

Anyone holding it can read the file, so the function handing it out decides who may. **The functions that sign an upload, save a key or sign a read each take an id, so each gets a `pikkuPermission` that loads that row.** A check in the body, or a signed-in check alone, does not count.

Public and private are separate stores: pass the same `visibility` on every call, or a public file answers 404.

## Not checked for you

The built-in store's `getUploadURL` checks neither `contentType` nor `size`, and another backend may enforce its own policy and refuse, so allow types with a `z.enum` on the input regardless. On the built-in store the largest upload is `content.sizeLimit` in pikku.config.json, default `1mb`, then 413: raise it for phone photos. A signed upload to another store is not bound by it.

`writeFile`, `copyFile` and `deleteFile` return `false` on failure instead of throwing.

## An agent reading a file

`content.readFileAsBuffer({ bucket, key })`, then `attachments: [{ type: 'image', data: buffer.toString('base64'), mediaType }]` on `rpc.agent.run`; `type: 'file'` for a PDF. Base64 only here, server-side.
