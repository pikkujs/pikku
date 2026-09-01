import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LocalEmailService } from './local-email-service.js'

test('LocalEmailService logs sent email metadata as JSON', async () => {
  const service = new LocalEmailService()
  const writes: string[] = []
  const originalInfo = console.info
  console.info = (value?: unknown) => {
    writes.push(String(value))
  }

  try {
    await service.send({
      to: 'user@example.com',
      from: 'hello@example.com',
      subject: 'Welcome',
      template: {
        name: 'welcome',
        locale: 'en',
        data: { userName: 'Yasser' },
      },
    })
  } finally {
    console.info = originalInfo
  }

  assert.equal(writes.length, 1)
  const payload = JSON.parse(writes[0])
  assert.equal(payload.type, 'email')
  assert.equal(payload.message, 'this email was sent')
  assert.equal(payload.to, 'user@example.com')
  assert.equal(payload.from, 'hello@example.com')
  assert.equal(payload.subject, 'Welcome')
  assert.deepEqual(payload.template, {
    name: 'welcome',
    locale: 'en',
    data: { userName: 'Yasser' },
  })
})

test('LocalEmailService logs htmlLength and textLength for HTML email', async () => {
  const service = new LocalEmailService()
  const writes: string[] = []
  const originalInfo = console.info
  console.info = (value?: unknown) => {
    writes.push(String(value))
  }

  try {
    await service.send({
      to: 'user@example.com',
      html: '<p>Hello</p>',
      text: 'Hello',
    })
  } finally {
    console.info = originalInfo
  }

  const payload = JSON.parse(writes[0])
  assert.equal(payload.htmlLength, '<p>Hello</p>'.length)
  assert.equal(payload.textLength, 'Hello'.length)
})

test('LocalEmailService logs textLength only for plain text email', async () => {
  const service = new LocalEmailService()
  const writes: string[] = []
  const originalInfo = console.info
  console.info = (value?: unknown) => {
    writes.push(String(value))
  }

  try {
    await service.send({
      to: 'user@example.com',
      text: 'Plain text body',
    })
  } finally {
    console.info = originalInfo
  }

  const payload = JSON.parse(writes[0])
  assert.equal(payload.textLength, 'Plain text body'.length)
  assert.equal(payload.htmlLength, undefined)
})

test('LocalEmailService logs null textLength for HTML email without plain text', async () => {
  const service = new LocalEmailService()
  const writes: string[] = []
  const originalInfo = console.info
  console.info = (value?: unknown) => {
    writes.push(String(value))
  }

  try {
    await service.send({
      to: 'user@example.com',
      html: '<p>Hello</p>',
    })
  } finally {
    console.info = originalInfo
  }

  const payload = JSON.parse(writes[0])
  assert.equal(payload.htmlLength, '<p>Hello</p>'.length)
  assert.equal(payload.textLength, null)
})

test('LocalEmailService logs attachment metadata without the content', async () => {
  const service = new LocalEmailService()
  const writes: string[] = []
  const originalInfo = console.info
  console.info = (value?: unknown) => {
    writes.push(String(value))
  }

  try {
    await service.send({
      to: 'user@example.com',
      html: '<img src="cid:logo" />',
      attachments: [
        {
          filename: 'receipt.pdf',
          content: new Uint8Array([1, 2, 3, 4]),
          contentType: 'application/pdf',
        },
        {
          filename: 'logo.png',
          content: 'aGVsbG8=',
          contentType: 'image/png',
          contentId: 'logo',
          disposition: 'inline',
        },
      ],
    })
  } finally {
    console.info = originalInfo
  }

  const payload = JSON.parse(writes[0])
  assert.deepEqual(payload.attachments, [
    {
      filename: 'receipt.pdf',
      contentType: 'application/pdf',
      contentId: null,
      disposition: 'attachment',
      contentLength: 4,
    },
    {
      filename: 'logo.png',
      contentType: 'image/png',
      contentId: 'logo',
      disposition: 'inline',
      contentLength: 8,
    },
  ])
  assert.equal(writes[0].includes('aGVsbG8='), false)
})

test('LocalEmailService omits attachments when there are none', async () => {
  const service = new LocalEmailService()
  const writes: string[] = []
  const originalInfo = console.info
  console.info = (value?: unknown) => {
    writes.push(String(value))
  }

  try {
    await service.send({ to: 'user@example.com', text: 'no files' })
    await service.send({
      to: 'user@example.com',
      text: 'no files',
      attachments: [],
    })
  } finally {
    console.info = originalInfo
  }

  assert.equal(JSON.parse(writes[0]).attachments, undefined)
  assert.equal(JSON.parse(writes[1]).attachments, undefined)
})
