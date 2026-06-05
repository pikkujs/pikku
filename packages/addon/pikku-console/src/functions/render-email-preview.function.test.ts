import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NotFoundError } from '@pikku/core'

import { renderEmailPreview } from './render-email-preview.function.js'
import type { RenderEmailPreviewOutput } from './render-email-preview.function.js'

test('renderEmailPreview renders subject, layout, partials, text, and metadata', async () => {
  const metaService = {
    getEmailMeta: async () => ({
      src: 'emails',
      themeHash: 'theme-hash',
      templates: {
        welcome: {
          variables: ['user.name', 'appName'],
          hasHtml: true,
          hasSubject: true,
          hasText: true,
          locales: {
            en: {
              contentHash: 'hash-en',
              htmlHash: 'html-en',
              subjectHash: 'subject-en',
              textHash: 'text-en',
            },
          },
        },
      },
    }),
    getEmailTemplateAssets: async (templateName: string, locale: string) => {
      assert.equal(templateName, 'welcome')
      assert.equal(locale, 'en')
      return {
        theme: { appName: 'Theme App' },
        strings: { helloWorld: { intro: 'Glad you are here' } },
        layout: '<html><body><h1>{{ subject }}</h1>{{ content }}</body></html>',
        partials: {
          footer: '<footer>{{ appName }}</footer>',
        },
        html: '<p>Hello {{ user.name }}. {{ t.helloWorld.intro }}</p>{{ > footer }}',
        subject: 'Welcome {{ user.name }} to {{ appName }}',
        text: 'Plain text for {{ user.name }} from {{ appName }}',
        missing: ['user.name'],
      }
    },
  }

  const result = (await renderEmailPreview.func(
    { metaService } as never,
    {
      templateName: 'welcome',
      data: {
        user: { name: 'Ada' },
      },
    },
    undefined as never
  )) as RenderEmailPreviewOutput

  assert.equal(result.name, 'welcome')
  assert.equal(result.locale, 'en')
  assert.equal(result.subject, 'Welcome Ada to Theme App')
  assert.equal(
    result.html,
    '<html><body><h1>Welcome Ada to Theme App</h1><p>Hello Ada. Glad you are here</p><footer>Theme App</footer></body></html>'
  )
  assert.equal(result.text, 'Plain text for Ada from Theme App')
  assert.deepEqual(result.variables, ['user.name', 'appName'])
  assert.equal(result.hash, 'hash-en')
  assert.deepEqual(result.missing, ['user.name'])
})

test('renderEmailPreview falls back to the first locale and omits text when unavailable', async () => {
  const metaService = {
    getEmailMeta: async () => ({
      src: 'emails',
      themeHash: 'theme-hash',
      templates: {
        digest: {
          variables: ['headline'],
          hasHtml: true,
          hasSubject: true,
          hasText: false,
          locales: {
            de: {
              contentHash: 'hash-de',
              htmlHash: 'html-de',
              subjectHash: 'subject-de',
              textHash: 'text-de',
            },
          },
        },
      },
    }),
    getEmailTemplateAssets: async (templateName: string, locale: string) => {
      assert.equal(templateName, 'digest')
      assert.equal(locale, 'de')
      return {
        theme: { appName: 'Theme Name' },
        strings: {},
        layout: '',
        partials: {},
        html: '<p>{{ headline }}</p>',
        subject: 'Digest for {{ appName }}',
        text: '',
        missing: [],
      }
    },
  }

  const result = (await renderEmailPreview.func(
    { metaService } as never,
    {
      templateName: 'digest',
      data: {
        appName: 'Payload App',
        headline: 'Neuigkeiten',
      },
    },
    undefined as never
  )) as RenderEmailPreviewOutput

  assert.equal(result.locale, 'de')
  assert.equal(result.subject, 'Digest for Payload App')
  assert.equal(result.html, '<p>Neuigkeiten</p>')
  assert.equal('text' in result, false)
  assert.equal(result.hash, 'hash-de')
})

test('renderEmailPreview throws when the template is unknown', async () => {
  const metaService = {
    getEmailMeta: async () => ({
      src: 'emails',
      themeHash: 'theme-hash',
      templates: {},
    }),
  }

  await assert.rejects(
    () =>
      renderEmailPreview.func(
        { metaService } as never,
        {
          templateName: 'missing',
        },
        undefined as never
      ),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundError)
      assert.match((error as Error).message, /Unknown email template: missing/)
      return true
    }
  )
})
