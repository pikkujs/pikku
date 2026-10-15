---
type: question
title: Should brand image downloads refuse private-network addresses?
description: saveRemoteImages fetches every caller-supplied URL with the global fetch, bounded by timeout and size but not by host
tags: [code-edit, brand, network]
---

# Should brand image downloads refuse private-network addresses?

`saveRemoteImages` in `packages/code-edit/src/brand/remote-images.ts` takes a list of
URLs. It defaults `fetch` to the global `fetch` (line 33) and calls it on each URL
(line 42).

The only limits in the file are the image count (line 33, `maxImages`), the timeout
(`timeoutMs`, line 33 and line 42) and the byte size (line 47). Nothing checks the
host or the address a URL resolves to. The file imports only `node:fs` and
`node:path` (lines 1-2), so it does not use any shared safe-fetch helper.

The `fetch` option (line 31) lets a caller replace the function, but the default path
does not restrict destinations.

Question: should caller-supplied URLs be limited to public addresses before they are
fetched? The code does not say whether the URLs can ever be untrusted.
