---
name: pikku-emails
description: >-
  Use when working with Pikku's file-based email templates: authoring HTML/subject/text templates,
  locales, partials and theme, running `pikku emails generate`, and rendering/sending them through
  an EmailService. TRIGGER when: code uses renderEmailTemplate, EmailTemplateName, EmailService,
  SendTemplateEmailInput, LocalEmailService, or imports from .pikku/email/pikku-emails.gen.
  TRIGGER when: the project has an emails/ directory (templates/, locales/, partials/, theme.json)
  or emailTemplatesDir in pikku.config.json. TRIGGER when: user asks to add/edit a transactional
  email (verification, password reset, invitation, receipt), wire email sending, or translate an
  email. DO NOT TRIGGER when: user asks about i18n for the app UI (use pikku-i18n) or auth flows
  in general (use pikku-better-auth).
installGroups: [core]
---

# Pikku Emails

Pikku compiles a directory of plain template files into a typed, dependency-free
renderer. `pikku emails generate` reads `emailTemplatesDir` and writes
`.pikku/email/pikku-emails.gen.ts` (the `renderEmailTemplate` function + per-template
types) and `pikku-emails-meta.gen.json`. Templates are authored as files; the
generated output is never edited by hand.

## Agent Operating Procedure

1. Edit source files under `emailTemplatesDir` only. Never edit `.pikku/email/*`.
2. After any change run `pikku emails generate` (it is also part of `prebuild`, usually
   `pikku bootstrap; pikku all; pikku emails generate`).
3. Validate by importing `renderEmailTemplate` and rendering with sample data, or run the
   project's typecheck — the generated `data` type will flag missing/wrong variables.
4. Fix the source cause; do not patch generated files or update hashes by hand.

## Config

```jsonc
// pikku.config.json
{
  "emailTemplatesDir": "emails",   // relative to rootDir; omit to disable emails
  "outDir": ".pikku"               // gen lands in <outDir>/email/
}
```

If `emailTemplatesDir` is unset the command is a no-op.

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

A template's **name** is its filename without the `.html` / `.subject.txt` / `.text.txt`
suffix (`verify-email` above). `html` and `subject` are required; `text` is optional and,
when present, becomes the plain-text MIME part.

## Templating syntax

Placeholders are `{{ ... }}`. Resolution order inside a template:

- `{{appName}}` — from `data.appName`, falling back to `theme.appName`.
- `{{theme.colors.accent}}`, `{{theme.fonts.body}}` — values from `theme.json`.
- `{{t.verifyEmail.heading}}` — string from the active locale file (`locales/<locale>.json`).
- `{{verifyUrl}}` — any other key is a **runtime variable**, supplied via `data`.
- `{{> footer}}` — include a partial from `partials/`.
- `{{content}}` / `{{subject}}` — only meaningful inside `partials/layout.html`
  (the rendered body and subject). `layout.html` wraps every template if present.

Locale strings may themselves contain variables and partial-free placeholders, e.g.
`"subject": "{{inviterName}} invited you to join {{organizationName}}"`. These are
resolved in the same pass, so a subject of `{{t.invitation.subject}}` expands fully.

## Typed variables (per template)

The generator extracts the runtime variables each template references and emits a typed
`data` shape. Extraction is **scoped to the template**: it walks the template's
html/subject/text, the partials it includes, and only the locale keys it actually
references (transitively) — variables from unrelated locale entries do not leak in.

```ts
import {
  renderEmailTemplate,
  type EmailTemplateName,
  type EmailTemplateVariables,
} from './.pikku/email/pikku-emails.gen.js'

// EmailTemplateVariables<'organization-invitation'> =
//   { appName?: ...; inviteUrl?: ...; inviterName?: ...; organizationName?: ... }
```

To make a variable required-and-typed, reference it directly in the template body (not
only in a locale string), so it shows up as that template's variable.

## Rendering

```ts
const rendered = renderEmailTemplate({
  name: 'verify-email',        // EmailTemplateName (autocompleted)
  locale: 'en',                // optional, defaults to 'en'
  data: { verifyUrl: url },    // EmailTemplateVariables<'verify-email'>
})
// rendered: { name, locale, subject, html, text?, variables, hash }
```

`hash` is a stable content hash (useful as an idempotency / dedupe key on outgoing mail).

## Sending through an EmailService

`@pikku/core/services` defines `EmailService.send(input)` where `input` is one of
`SendTextEmailInput`, `SendHTMLEmailInput`, or `SendTemplateEmailInput`:

```ts
import type { EmailService } from '@pikku/core/services'

await email.send({
  to: user.email,
  template: { name: 'verify-email', locale: user.locale, data: { verifyUrl } },
})
```

`LocalEmailService` (dev/test) captures the payload as-is. To actually render templates
before sending, wrap a delegate service: when `input.template` is present, call
`renderEmailTemplate` and forward `subject` / `html` / `text` to the delegate (e.g. a
Resend/SES/SMTP service). This wrapper is project-owned because `renderEmailTemplate`
is generated per project; wire it in `services.ts` and inject it into functions.

```ts
async send(input: SendEmailInput) {
  if (!('template' in input) || !input.template) return this.delegate.send(input)
  const r = renderEmailTemplate(input.template as RenderEmailInput<EmailTemplateName>)
  return this.delegate.send({
    to: input.to, from: input.from, subject: r.subject, html: r.html,
    ...(r.text ? { text: r.text } : {}),
  })
}
```

## Generated artifacts

- `.pikku/email/pikku-emails.gen.ts` — `renderEmailTemplate`, `EmailTemplateName`,
  `EmailLocale`, `EmailTemplateVariables<T>`, inlined templates/locales/partials/theme.
- `.pikku/email/pikku-emails-meta.gen.json` — per-template `variables`, `hasHtml/Subject/Text`,
  and per-locale content hashes. Both are regenerated; keep them out of hand edits and
  (typically) git-ignored.

## Gotchas

- New template not appearing → you added `.html` but forgot `.subject.txt` (subject is
  required), or didn't rerun `pikku emails generate`.
- Variable typed `unknown`/missing → it's only in a locale string for a different template;
  reference it in this template to scope it in.
- Editing a locale string changes that template's content hash — expected; the hash covers
  the strings the template uses.
- `layout.html` must contain `{{content}}` or the body is dropped.
