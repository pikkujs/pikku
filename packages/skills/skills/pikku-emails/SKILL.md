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

1. Edit source files under `emailTemplatesDir` only. Never edit `.pikku/email/*`. If the
   directory does not exist yet, run `pikku emails init` rather than creating it by hand.
2. After any change run `pikku emails generate` (it is also part of `prebuild`, usually
   `pikku bootstrap; pikku all; pikku emails generate`).
3. Validate by importing `renderEmailTemplate` and rendering with sample data, or run the
   project's typecheck — the generated `data` type will flag missing/wrong variables.
4. Fix the source cause; do not patch generated files or update hashes by hand.

## Config

```jsonc
// pikku.config.json
{
  "emailTemplatesDir": "emails", // relative to rootDir; omit to disable emails
  "outDir": ".pikku", // gen lands in <outDir>/email/
}
```

If `emailTemplatesDir` is unset the command is a no-op — it logs
`Skipping emails (set emailTemplatesDir in pikku.config.json to enable).` and exits
cleanly, so a silent generate is a config problem, not a template problem.

`pikku emails init` scaffolds the directory (starter locales, theme, partials and a
hello-world template) **and** writes `emailTemplatesDir` into `pikku.config.json` for
you. Use it rather than hand-creating the tree; `--force` overwrites an existing
scaffold.

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
- `{{{verifyUrl}}}` — the same value **unescaped**. See below.

Locale strings may themselves contain variables and partial-free placeholders, e.g.
`"subject": "{{inviterName}} invited you to join {{organizationName}}"`. Locale files
and `theme.json` ship alongside the templates, so they are expanded first and a subject
of `{{t.invitation.subject}}` expands fully.

## Escaping

Values are HTML-escaped (`& < > " '`) on the way into `.html` output, so a URL, a
display name or a font stack containing quotes lands inside its attribute instead of
breaking out of it. `.subject.txt` and `.text.txt` are plain text and are never escaped.

Rendering is **layered by trust**, and the layers do not leak into each other:

- Partials are inlined first — a `data` value that happens to contain `{{> footer}}`
  is not an include.
- `theme.*` and `t.*` are template-author input: expanded next, escaped, and allowed
  to contain further placeholders (up to 5 levels).
- Everything else is caller data: substituted in **one pass**, escaped, and never
  rescanned — a `data` value containing `{{...}}` renders as those literal characters.

`{{content}}` and partials are template-authored markup and stay raw. For a value you
genuinely want inserted as markup, use the explicit `{{{value}}}` form — it is opt-in,
it bypasses escaping entirely, and it is only safe for HTML you control.

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

Every extracted variable is emitted **optional** and typed `EmailTemplateValue`
(`string | number | boolean | null | undefined | object | array`). The type tells you
which variables a template can consume, not which ones it needs — there is no way to
mark one required, and a template that references none types as `Record<string, never>`.
Referencing a variable in the template body (rather than only in a locale string) is
what gets it into the type at all.

That matters because a placeholder with nothing behind it renders as the **empty
string** — no error, no leftover `{{…}}`. A typo'd variable name, a missing `data` key
and a value that isn't a string or number all produce the same silently blank output, so
render with sample data and read the result rather than trusting that it compiled.

## Rendering

```ts
const rendered = renderEmailTemplate({
  name: 'verify-email', // EmailTemplateName (autocompleted)
  locale: 'en', // optional, defaults to 'en'
  data: { verifyUrl: url }, // EmailTemplateVariables<'verify-email'>
})
// rendered: { name, locale, subject, html, text?, variables, hash }
```

It is synchronous, and it throws on an unknown template name or an unknown locale —
those are the only two failure modes; everything else degrades to blank output.

`hash` is a stable content hash (useful as an idempotency / dedupe key on outgoing mail).
The meta file also carries per-locale `htmlHash` / `subjectHash` / `textHash` if you need
to tell which part changed.

`{{locale}}` is in scope alongside `{{appName}}`, and placeholders are resolved by
repeated passes so a locale string containing `{{verifyUrl}}` expands. The loop stops
after 5 passes, which only becomes visible with placeholders nested more deeply than
that — a shape worth avoiding rather than working around.

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
    attachments: input.attachments,
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
- `layout.html` must contain `{{content}}` or the body is dropped. It is matched by the
  partial name `layout`, so renaming the file opts every template out of the wrapper.
- A blank spot where a value should be is an unresolved placeholder, not a render
  failure — check the key's spelling and that the value is a string or number (objects
  and arrays resolve to empty).
