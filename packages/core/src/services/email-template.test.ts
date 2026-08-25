import assert from 'node:assert'
import { describe, test } from 'node:test'
import { renderEmail, type EmailAssets } from './email-template.js'

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

const ASSETS: EmailAssets = {
  theme: THEME,
  locales: LOCALES,
  partials: PARTIALS,
  templates: {
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
  },
}

const render = (data: Record<string, unknown>) =>
  renderEmail(ASSETS, { name: 'password-reset', locale: 'en', data })

describe('renderEmail escaping', () => {
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

  // The recursion bounds are why a malicious partial or locale string cannot
  // hang the render, and neither is reachable from the generated wrapper's
  // types — only a template author can trip them.
  test('a partial that includes itself terminates instead of hanging', () => {
    const { html } = renderEmail(
      {
        ...ASSETS,
        partials: { loop: '<i>{{> loop}}</i>' },
        templates: {
          ...ASSETS.templates,
          'password-reset': {
            ...ASSETS.templates['password-reset']!,
            html: '{{> loop}}',
          },
        },
      },
      { name: 'password-reset', locale: 'en', data: {} }
    )
    assert.equal(html.match(/<i>/g)?.length, 5)
  })

  test('a locale string that references itself terminates instead of hanging', () => {
    const { subject } = renderEmail(
      {
        ...ASSETS,
        locales: { en: { loop: 'a{{t.loop}}' } },
        templates: {
          ...ASSETS.templates,
          'password-reset': {
            ...ASSETS.templates['password-reset']!,
            subject: '{{t.loop}}',
          },
        },
      },
      { name: 'password-reset', locale: 'en', data: {} }
    )
    // Five trusted passes plus the final substitute pass, and the token the
    // last one produced is left as text rather than expanded again.
    assert.equal(subject, 'aaaaaa{{t.loop}}')
  })
})

describe('renderEmail lookups', () => {
  test('an unknown template names itself rather than rendering an empty mail', () => {
    assert.throws(
      () => renderEmail(ASSETS, { name: 'nope' }),
      /Unknown email template: nope/
    )
  })

  test('an unknown locale names itself', () => {
    assert.throws(
      () => renderEmail(ASSETS, { name: 'password-reset', locale: 'de' }),
      /Unknown email locale: de/
    )
  })

  test('the locale defaults to en', () => {
    assert.equal(renderEmail(ASSETS, { name: 'password-reset' }).locale, 'en')
  })

  test('the content hash comes from the rendered locale', () => {
    assert.equal(render({}).hash, 'content-hash')
  })

  test('a template with no text produces no text field at all', () => {
    const result = renderEmail(
      {
        ...ASSETS,
        templates: {
          'password-reset': {
            ...ASSETS.templates['password-reset']!,
            text: '',
          },
        },
      },
      { name: 'password-reset' }
    )
    assert.equal('text' in result, false)
  })
})
