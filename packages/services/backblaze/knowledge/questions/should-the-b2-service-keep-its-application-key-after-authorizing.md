---
type: question
title: Should the B2 service keep its application key after authorizing?
description: b2-content.ts builds a base64 Basic credential in the constructor and keeps it as a field; it is read only when no token is cached, and nothing clears the token or the key
tags: [backblaze, b2, credentials]
---

# Should the B2 service keep its application key after authorizing?

In `packages/services/backblaze/src/b2-content.ts`, the constructor base64-encodes
the key id and application key into `this.credentials` (`b2-content.ts:53-55`). That
field is declared at `b2-content.ts:45` and is never cleared.

`ensureAuthorized` sends that value as a Basic header only when `this.auth` is not
set (`b2-content.ts:62-67`). It then stores the parsed response in `this.auth`
(`b2-content.ts:71`) and returns it (`b2-content.ts:73`). In the file, `this.auth` is
assigned only at line 71, and nothing resets it. So after the first successful call,
the stored key is not read again in practice.

The file gives no reason for keeping the key in memory. Open: does anything need it
after authorization, for example a token refresh? If not, should the field be
dropped after the first exchange? The code does not say which was intended.
