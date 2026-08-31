import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  EmailAttachment,
  EmailService,
  SendEmailInput,
  SendEmailResult,
  SendHTMLEmailInput,
  SendTemplateEmailInput,
  SendTextEmailInput,
} from './email-service.js'

const receipt: EmailAttachment = {
  filename: 'receipt.pdf',
  content: new Uint8Array([1, 2, 3]),
  contentType: 'application/pdf',
}

const logo: EmailAttachment = {
  filename: 'logo.png',
  content: 'aGVsbG8=',
  contentType: 'image/png',
  contentId: 'logo',
  disposition: 'inline',
}

test('a text email carries attachments', () => {
  const input: SendTextEmailInput = {
    to: 'user@example.com',
    text: 'Your receipt is attached',
    attachments: [receipt],
  }

  assert.deepEqual(input.attachments, [receipt])
})

test('an html email carries attachments', () => {
  const input: SendHTMLEmailInput = {
    to: 'user@example.com',
    html: '<img src="cid:logo" />',
    attachments: [logo],
  }

  assert.equal(input.attachments?.[0]?.disposition, 'inline')
  assert.equal(input.attachments?.[0]?.contentId, 'logo')
})

test('a template email carries attachments', () => {
  const input: SendTemplateEmailInput = {
    to: 'user@example.com',
    template: { name: 'receipt', locale: 'en', data: { total: 10 } },
    attachments: [receipt, logo],
  }

  assert.equal(input.attachments?.length, 2)
})

test('attachments are optional on every variant', () => {
  const inputs: SendEmailInput[] = [
    { to: 'user@example.com', text: 'hello' },
    { to: 'user@example.com', html: '<p>hello</p>' },
    { to: 'user@example.com', template: { name: 'welcome' } },
  ]

  for (const input of inputs) {
    assert.equal(input.attachments, undefined)
  }
})

test('a wrapping service forwards attachments to its delegate', async () => {
  const sent: SendEmailInput[] = []
  const delegate: EmailService = {
    async send(input): Promise<SendEmailResult> {
      sent.push(input as SendEmailInput)
      return { messageId: 'delegated' }
    },
  }

  const wrapper: EmailService = {
    async send(input): Promise<SendEmailResult> {
      const { template, ...rest } = input as SendTemplateEmailInput
      return delegate.send({
        ...rest,
        subject: `rendered:${template.name}`,
        html: '<p>rendered</p>',
      })
    },
  }

  const result = await wrapper.send({
    to: 'user@example.com',
    template: { name: 'receipt' },
    attachments: [receipt],
  })

  assert.equal(result.messageId, 'delegated')
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0]!.attachments, [receipt])
})
