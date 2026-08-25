import assert from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, test } from 'node:test'
import { serializeEmailsModule } from './serialize-emails.js'

const here = fileURLToPath(new URL('.', import.meta.url))

const THEME = {
  appName: 'Pikku App',
  colors: {
    background: '#f5f7fb',
    surface: '#ffffff',
    text: '#101828',
    border: '#d0d5dd',
    primary: '#7c3aed',
  },
  fonts: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
}

const LOCALES = {
  en: {
    passwordReset: {
      subject: 'Reset your {{appName}} password',
      note: 'If you did not ask for this, you can ignore it.',
      cta: 'Choose a new password',
    },
  },
}

const PARTIALS = {
  layout: `<!doctype html>
<html lang="{{locale}}">
  <head><title>{{subject}}</title></head>
  <body style="font-family:{{theme.fonts.body}};color:{{theme.colors.text}};">
    <div>{{content}}</div>
  </body>
</html>`,
  footer: `<div class="footer" style="color:{{theme.colors.border}};">{{t.passwordReset.note}}</div>`,
}

const HTML = `<div>
  <p>Hello {{userName}}.</p>
  <a href="{{resetUrl}}" style="background:{{theme.colors.primary}};">{{t.passwordReset.cta}}</a>
  <p>{{{rawNotice}}}</p>
</div>
{{> footer}}`

const SUBJECT = `{{t.passwordReset.subject}}\n`

const TEXT = `{{t.passwordReset.subject}}

Hello {{userName}}.

{{t.passwordReset.cta}}: {{resetUrl}}
`

const HASHES = {
  en: {
    contentHash: 'content-hash',
    htmlHash: 'html-hash',
    subjectHash: 'subject-hash',
    textHash: 'text-hash',
  },
}

const TEMPLATES = {
  'password-reset': {
    html: HTML,
    subject: SUBJECT,
    text: TEXT,
    variables: ['appName', 'rawNotice', 'resetUrl', 'userName'],
    hashes: HASHES,
  },
  'no-text': {
    html: '<p>{{userName}}</p>',
    subject: 'Hi',
    text: '',
    variables: ['userName'],
    hashes: HASHES,
  },
}

type RenderedEmail = {
  name: string
  locale: string
  subject: string
  html: string
  text?: string
  variables: ReadonlyArray<string>
  hash: string
}

type RenderEmailTemplate = (input: {
  name: 'password-reset' | 'no-text'
  locale?: 'en'
  data: Record<string, unknown>
}) => RenderedEmail

let tempDir: string
let renderEmailTemplate: RenderEmailTemplate

before(async () => {
  tempDir = await mkdtemp(join(here, 'tmp-emails-'))
  const modulePath = join(tempDir, 'pikku-emails.gen.ts')
  await writeFile(
    modulePath,
    serializeEmailsModule({
      theme: THEME,
      locales: LOCALES,
      partials: PARTIALS,
      templates: TEMPLATES,
    }),
    'utf8'
  )
  const generated = (await import(modulePath)) as {
    renderEmailTemplate: RenderEmailTemplate
  }
  renderEmailTemplate = generated.renderEmailTemplate
})

after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

function render(data: Record<string, unknown>) {
  return renderEmailTemplate({ name: 'password-reset', locale: 'en', data })
}

function renderTextless(data: Record<string, unknown>) {
  return renderEmailTemplate({ name: 'no-text', locale: 'en', data })
}

/**
 * The escaping rules themselves are core's `renderEmail`, tested against real
 * code in email-template.test.ts. What is generated — and so what is tested
 * here, by importing the module the CLI actually writes — is the seam: the
 * assets reach the renderer, and the typed wrapper hands back everything it
 * returned.
 */
describe('the generated email module', () => {
  test('the assets reach the renderer, so escaping applies', () => {
    const { html } = render({
      resetUrl: '"><script>alert(1)</script><a href="',
    })
    assert.ok(!html.includes('<script>'), `raw <script> present:\n${html}`)
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  })

  test('theme, locale strings and partials are all wired in', () => {
    const { html, subject } = render({
      userName: 'Ada',
      resetUrl: 'https://x.test/reset',
    })
    // theme.appName, reached through a locale string that references it
    assert.strictEqual(subject, 'Reset your Pikku App password')
    // the layout partial, and a partial the template itself includes
    assert.ok(
      html.includes('<title>Reset your Pikku App password</title>'),
      html
    )
    assert.ok(html.includes('<div class="footer"'), html)
    assert.ok(html.includes('style="background:#7c3aed;"'), html)
  })

  test('the wrapper loses nothing the renderer returned', () => {
    const rendered = render({
      userName: 'Ada',
      resetUrl: 'https://x.test/reset',
    })
    assert.deepStrictEqual(
      { ...rendered, html: '<html>', subject: '<subject>', text: '<text>' },
      {
        name: 'password-reset',
        locale: 'en',
        html: '<html>',
        subject: '<subject>',
        text: '<text>',
        variables: ['appName', 'rawNotice', 'resetUrl', 'userName'],
        hash: 'content-hash',
      }
    )
  })

  test('a template with no text yields no text field', () => {
    assert.strictEqual('text' in renderTextless({}), false)
  })
})
