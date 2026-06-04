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
