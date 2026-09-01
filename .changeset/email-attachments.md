---
'@pikku/core': patch
'@pikku/skills': patch
---

Add file attachments to `EmailService`.

`BaseSendEmailInput` gains an optional `attachments: EmailAttachment[]`, so it is
available on all three input variants — text, HTML and template. The new
`EmailAttachment` type is exported from `@pikku/core/services` alongside the
input types, and is shaped so that mapping it onto Resend, SendGrid, Nodemailer
or SES v2 is a straight field rename rather than a translation.

`content` is `Uint8Array | string`, where a string is always read as base64.
Both forms are accepted because both are what callers already hold: bytes come
out of a fetch or a file read, and base64 comes out of a database column or a
provider API. `Buffer` is deliberately absent from the type — it is a subclass
of `Uint8Array`, so Node callers can still pass one, while the type stays usable
in Cloudflare Workers, where `Buffer` does not exist.

`LocalEmailService` now logs attachment metadata — filename, content type,
content id, disposition and content length — instead of dropping the field
silently. The content itself is deliberately not logged.

The template-rendering wrapper documented in the emails skill rebuilt its
delegate payload field by field and therefore dropped `attachments`; it now
forwards them.
