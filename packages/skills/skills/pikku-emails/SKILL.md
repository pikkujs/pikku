---
name: pikku-emails
description: >-
  File-based transactional emails (verification, reset, invitation, receipt): emails/ directory, locales, partials, theme, `pikku emails generate`, renderEmailTemplate, EmailService.
installGroups: [core]
---

# Pikku Emails

`pikku emails generate` compiles `emailTemplatesDir` into a typed, dependency-free renderer: `.pikku/email/pikku-emails.gen.ts` (`renderEmailTemplate` + per-template types) and `pikku-emails-meta.gen.json`.

## Agent Operating Procedure

1. Edit source files under `emailTemplatesDir` only, never `.pikku/email/*`. If the directory does not exist, run `pikku emails init` rather than creating it by hand.
2. After any change run `pikku emails generate` (also part of `prebuild`, usually `pikku bootstrap; pikku all; pikku emails generate`).
3. Validate by importing `renderEmailTemplate`, rendering with sample data and reading the output. Typechecking is not a substitute: every variable is optional, so an omitted `verifyUrl` still compiles.
4. Fix the source cause; do not patch generated files or update hashes by hand.

## Config

```jsonc
// pikku.config.json
{
  "emailTemplatesDir": "emails", // relative to rootDir; omit to disable emails
  "outDir": ".pikku", // gen lands in <outDir>/email/
}
```

With `emailTemplatesDir` unset the command is a no-op: it logs `Skipping emails (set emailTemplatesDir in pikku.config.json to enable).` and exits cleanly, so a silent generate is a config problem, not a template problem.

`pikku emails init` scaffolds the directory (starter locales, theme, partials, a hello-world template) **and** writes `emailTemplatesDir` into `pikku.config.json`. `--force` overwrites an existing scaffold.

## Keep to the request

- Another language: add `locales/<locale>.json` and pass the recipient's own language as `locale` on the send. Never hard-code a locale, which replaces the language the email had. If the app records no language for that person, say so in the reply. A language with no `locales/<locale>.json` makes the renderer throw rather than send, so map the recipient's language to a locale that exists using the project's fallback policy (usually `en`), and say which translation is missing.
- `theme.json` and other templates stay as they are unless the owner asked to change them.

## Directory layout

```text
emails/
  theme.json                 # brand tokens: appName, fonts, colors
  locales/
    en.json                  # translation strings, nested namespaces
    de.json                  # one file per locale (filename = locale key)
  partials/
    layout.html              # outer wrapper; must include {{content}}
    footer.html              # reusable fragment, included with {{> footer}}
  templates/
    verify-email.html        # body (required)
    verify-email.subject.txt # subject line (required)
    verify-email.text.txt    # plain-text alternative (optional)
```

A template's **name** is its filename without the `.html` / `.subject.txt` / `.text.txt` suffix. `text`, when present, becomes the plain-text MIME part.

## Templating syntax

Resolution of `{{ ... }}` inside a template:

- `{{appName}}`: from `data.appName`, falling back to `theme.appName`. `{{locale}}` is in scope alongside it.
- `{{theme.colors.accent}}`, `{{theme.fonts.body}}`: values from `theme.json`.
- `{{t.verifyEmail.heading}}`: string from the active `locales/<locale>.json`.
- `{{verifyUrl}}`: any other key is a **runtime variable**, supplied via `data`.
- `{{> footer}}`: include a partial from `partials/`.
- `{{content}}` / `{{subject}}`: only meaningful inside `partials/layout.html` (the rendered body and subject). `layout.html` wraps every template if present.
- `{{{verifyUrl}}}`: the same value **unescaped** (see below).

Locale strings may contain variables and partial-free placeholders, e.g. `"subject": "{{inviterName}} invited you to join {{organizationName}}"`. Locale files and `theme.json` expand first, so a subject of `{{t.invitation.subject}}` expands fully. Resolution stops after 5 repeated passes; avoid nesting deeper than that.

## Escaping

Values are HTML-escaped (`& < > " '`) into `.html` output, so a URL, name or font stack with quotes stays inside its attribute. `.subject.txt` and `.text.txt` are plain text and never escaped.

Rendering is **layered by trust**; the layers do not leak:

- Partials are inlined first: a `data` value containing `{{> footer}}` is not an include.
- `theme.*` and `t.*` are template-author input: expanded next, escaped, allowed to contain further placeholders (up to 5 levels).
- Everything else is caller data: substituted in **one pass**, escaped, never rescanned. A `data` value containing `{{...}}` renders literally.

`{{content}}` and partials stay raw. For a value you want inserted as markup, use the explicit `{{{value}}}`: it bypasses escaping entirely and is only safe for HTML you control.

## Typed variables (per template)

The generator emits a typed `data` shape per template. Extraction is **scoped to the template**: its html/subject/text, the partials it includes, and only the locale keys it references (transitively). Variables from unrelated locale entries do not leak in.

```ts
import {
  renderEmailTemplate,
  type EmailTemplateName,
  type EmailTemplateVariables,
} from './.pikku/email/pikku-emails.gen.js'

// EmailTemplateVariables<'organization-invitation'> =
//   { appName?: ...; inviteUrl?: ...; inviterName?: ...; organizationName?: ... }
```

Every extracted variable is **optional** and typed `EmailTemplateValue` (`string | number | boolean | null | undefined | object | array`). The type says which variables a template can consume, not which it needs: none can be marked required, and a template referencing none types as `Record<string, never>`. A variable gets into the type when the template's html, subject, text, a partial it includes, the layout or a locale string it uses references it.

A placeholder with nothing behind it renders as the **empty string**: no error, no leftover `{{…}}`. A typo, a missing `data` key and a value that isn't a string or number all go silently blank, so render with sample data and read the result rather than trusting that it compiled.

## Rendering

```ts
const rendered = renderEmailTemplate({
  name: 'verify-email', // EmailTemplateName (autocompleted)
  locale: 'en', // optional, defaults to 'en'
  data: { verifyUrl: url }, // EmailTemplateVariables<'verify-email'>
})
// rendered: { name, locale, subject, html, text?, variables, hash }
```

Synchronous. It throws on an unknown template name or unknown locale, the only two failure modes; everything else degrades to blank output.

`hash` identifies the template content for that locale, not one send: do not use it alone as a dedupe key, or a different recipient or different data is suppressed. Use an identifier for each intended send, reused only for its retries. The meta file carries per-locale `htmlHash` / `subjectHash` / `textHash` to tell which part changed.

## Sending through an EmailService

An email sent because something happened is a step in a `pikkuWorkflowFunc`, started with `rpc.startWorkflow`, even with one step, so a failed send shows and can retry. A function never sends one inline. An auth callback such as `sendMagicLink` runs inside the auth request: keep that endpoint synchronous and hand only the send to a workflow from the callback; never turn the auth action itself into a workflow.

`EmailService.send` takes no idempotency key. A workflow retries a step, so where a retry must not resend an accepted message, have the project-owned service pass a stable key for that send to a provider that supports one.

`pikku doc email EmailAttachment` lists the types. An attachment needs `filename` and `content` (`Uint8Array`, or a base64 string: a plain string is never read as text); `contentType`, `contentId` and `disposition` (`'attachment' | 'inline'`) are optional. `@pikku/core/services` defines `EmailService.send(input)` where `input` is `SendTextEmailInput`, `SendHTMLEmailInput` or `SendTemplateEmailInput`:

```ts
import type { EmailService } from '@pikku/core/services'

await emailService.send({
  to: user.email,
  template: { name: 'verify-email', locale: user.locale, data: { verifyUrl } },
})
```

`LocalEmailService` (dev/test) captures the payload as-is. To render before sending, wrap a delegate service (Resend/SES/SMTP) as below. The wrapper is project-owned because `renderEmailTemplate` is generated per project; wire it in `services.ts` and inject it into functions.

```ts
async send(input: SendEmailInput) {
  if (!('template' in input) || !input.template) return this.delegate.send(input)
  const r = renderEmailTemplate(input.template as RenderEmailInput<EmailTemplateName>)
  return this.delegate.send({
    to: input.to, from: input.from, subject: r.subject, html: r.html,
    cc: input.cc, bcc: input.bcc, replyTo: input.replyTo, headers: input.headers,
    attachments: input.attachments,
    ...(r.text ? { text: r.text } : {}),
  })
}
```

## Generated artifacts

- `.pikku/email/pikku-emails.gen.ts`: `renderEmailTemplate`, `EmailTemplateName`, `EmailLocale`, `EmailTemplateVariables<T>`, inlined templates/locales/partials/theme.
- `.pikku/email/pikku-emails-meta.gen.json`: per-template `variables`, `hasHtml/Subject/Text`, per-locale content hashes.

Both are regenerated: no hand edits, and typically git-ignored.

## Gotchas

- New template not appearing: you added `.html` but no `.subject.txt` (subject is required), or didn't rerun `pikku emails generate`.
- Variable typed `unknown`/missing: it's only in a locale string for a different template; reference it in this template.
- Editing a locale string changes that template's content hash. Expected: the hash covers the strings it uses.
- `layout.html` must contain `{{content}}` or the body is dropped. It is matched by the partial name `layout`, so renaming the file opts every template out of the wrapper.
- A blank spot is an unresolved placeholder, not a render failure: check the key's spelling and that the value is a string or number (objects and arrays resolve to empty).
