---
type: decision
title: Mail reaches a persona run only after sender and link-origin allowlisting
description: applyMailboxAllowlist keeps only mail from listed senders and drops links to unlisted origins; the engine ships no mailbox, so every implementation must call this helper
tags: core, personas, email, prompt-injection
---

# Mail reaches a persona run only after sender and link-origin allowlisting

`packages/core/src/wirings/persona/persona-mailbox.ts` defines the `PersonaMailbox`
interface and the allowlist helpers.

The interface doc says implementations "**must** apply `MailboxAllowlist` before
returning anything", and calls this the primary defence against prompt injection,
because a virtual user's address can be reached by anyone who learns it
(`persona-mailbox.ts:40-44`). The engine ships no mailbox: capturing mail is
platform-specific, so pikku "declares the interface and ships no default"
(`persona-mailbox.ts:36-38`).

`applyMailboxAllowlist` filters by sender and then trims each email's links
(`persona-mailbox.ts:150-156`). The doc comment says implementations should call
it rather than filter themselves (`persona-mailbox.ts:146-148`).

- Sender: an entry with `@` must match the whole address. A bare domain must
  equal the part after the last `@` (`persona-mailbox.ts:91-101`). The comment
  says a bare domain never matches as a substring (`persona-mailbox.ts:97-98`).
- Links: with no `linkOrigins`, every link is kept (`persona-mailbox.ts:122-124`).
  Otherwise a link is kept only when its origin is listed, and a link that does not
  parse is dropped (`persona-mailbox.ts:134-140`).
- Links are filtered rather than the whole email rejected, because a legitimate
  email may carry an unrelated unsubscribe link (`persona-mailbox.ts:109-116`).

The raw `body` is optional and is not meant to reach a model context
(`persona-mailbox.ts:25-29`).

**What this rules out:** a persona run acting on mail from an unlisted sender, and
following a link that leaves the origins the stage allowed. Nothing in this file
checks that an implementation actually calls the helper.
