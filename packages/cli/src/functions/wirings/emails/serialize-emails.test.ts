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

const TEMPLATES = {
  'password-reset': {
    html: HTML,
    subject: SUBJECT,
    text: TEXT,
    variables: ['appName', 'rawNotice', 'resetUrl', 'userName'],
    hashes: {
      en: {
        contentHash: 'content-hash',
        htmlHash: 'html-hash',
        subjectHash: 'subject-hash',
        textHash: 'text-hash',
      },
    },
  },
}

type RenderedEmail = {
  subject: string
  html: string
  text?: string
}

type RenderEmailTemplate = (input: {
  name: 'password-reset'
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

describe('generated email renderer escaping', () => {
  test('a value containing a double quote cannot break out of an attribute', () => {
    const { html } = render({
      resetUrl: 'https://x.test/" onmouseover="alert(1)',
    })
    assert.ok(
      !html.includes('onmouseover="alert(1)"'),
      `attribute broke out:\n${html}`
    )
    assert.ok(
      html.includes('href="https://x.test/&quot; onmouseover=&quot;alert(1)"'),
      `quote was not escaped:\n${html}`
    )
  })

  test('a value containing markup renders escaped, with no raw script tag', () => {
    const { html } = render({
      resetUrl: '"><script>alert(1)</script><a href="',
    })
    assert.ok(!html.includes('<script>'), `raw <script> present:\n${html}`)
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  })

  test('a value containing handlebars is not re-expanded', () => {
    const { html } = render({ resetUrl: '{{t.passwordReset.note}}' })
    assert.ok(
      !html.includes('If you did not ask for this, you can ignore it.</a>'),
      `caller value was re-expanded as a template:\n${html}`
    )
    assert.ok(html.includes('href="{{t.passwordReset.note}}"'))
  })

  test('a value cannot forge a partial reference', () => {
    const { html } = render({ resetUrl: '{{> footer}}' })
    assert.ok(html.includes('href="{{&gt; footer}}"'), html)
  })

  test('a font stack with embedded quotes renders a valid style attribute', () => {
    const { html } = render({ resetUrl: 'https://x.test/reset' })
    assert.ok(
      html.includes(
        '<body style="font-family:-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, sans-serif;color:#101828;">'
      ),
      `theme font stack corrupted the style attribute:\n${html}`
    )
  })

  test('an app name with an apostrophe and an ampersand stays inside the tag', () => {
    const { html, subject } = render({
      appName: "Peet's & Co",
      resetUrl: 'https://x.test/reset',
    })
    assert.ok(
      html.includes('<title>Reset your Peet&#39;s &amp; Co password</title>'),
      html
    )
    assert.strictEqual(subject, "Reset your Peet's & Co password")
  })

  test('{{content}} and partials still render raw', () => {
    const { html } = render({ resetUrl: 'https://x.test/reset' })
    assert.ok(html.includes('<a href="https://x.test/reset"'), html)
    assert.ok(html.includes('<div class="footer"'), html)
    assert.ok(
      html.includes('>If you did not ask for this, you can ignore it.</div>'),
      html
    )
  })

  test('the triple-brace form is an opt-in raw escape hatch', () => {
    const { html } = render({
      resetUrl: 'https://x.test/reset',
      rawNotice: '<strong>read me</strong>',
    })
    assert.ok(html.includes('<p><strong>read me</strong></p>'), html)
  })

  test('locale strings that reference caller variables still expand', () => {
    const { subject, text } = render({
      userName: 'Ada',
      resetUrl: 'https://x.test/reset',
    })
    assert.strictEqual(subject, 'Reset your Pikku App password')
    assert.ok(text?.includes('Hello Ada.'), text)
    assert.ok(
      text?.includes('Choose a new password: https://x.test/reset'),
      text
    )
  })

  test('plain-text outputs are not html escaped', () => {
    const { text } = render({
      userName: 'Ada & Bob',
      resetUrl: 'https://x.test/reset?a=1&b=2',
    })
    assert.ok(text?.includes('Hello Ada & Bob.'), text)
    assert.ok(text?.includes('https://x.test/reset?a=1&b=2'), text)
  })
})
