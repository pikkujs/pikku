---
'@pikku/core': patch
---

Add the `InboundEmail` contract

The outbound half of email has lived in core for a while — `EmailService`,
`SendEmailInput`. `InboundEmail` is the shape every inbound source hands to a
trigger handler, so a handler wired to Cloudflare, IMAP, Gmail or a local SMTP
listener is the same handler.

The source parses MIME and passes a whole message, attachments inline. Nothing
is persisted on the way, so a hosted source never accumulates a corpus of tenant
mail. Mailbox operations are deliberately absent: they mean nothing to a source
handed a single message that never sees the mailbox it came from.
