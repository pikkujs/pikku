import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { FastifyRequest } from 'fastify'

import { FastifyPikkuHTTPRequest } from './fastify-pikku-http-request.js'

const fastifyRequest = (
  overrides: Partial<Record<string, unknown>> = {}
): FastifyRequest =>
  ({
    method: 'POST',
    url: '/upload',
    query: {},
    headers: { 'content-type': 'application/json' },
    body: {},
    ...overrides,
  }) as unknown as FastifyRequest

describe('FastifyPikkuHTTPRequest body size limit', () => {
  test('data() rejects a body whose content-length exceeds the limit', async () => {
    const req = fastifyRequest({
      headers: {
        'content-type': 'application/json',
        'content-length': '4096',
      },
      body: { padding: 'x'.repeat(4000) },
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req, { maxBodySize: 16 })
    await assert.rejects(async () => await pikkuReq.data(), {
      name: 'PayloadTooLargeError',
    })
  })

  test('data() rejects a buffered body larger than the limit with no content-length', async () => {
    const req = fastifyRequest({
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ padding: 'x'.repeat(256) })),
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req, { maxBodySize: 16 })
    await assert.rejects(async () => await pikkuReq.data(), {
      name: 'PayloadTooLargeError',
    })
  })

  test('data() accepts a body within the configured limit', async () => {
    const req = fastifyRequest({
      headers: {
        'content-type': 'application/json',
        'content-length': '13',
      },
      body: { ok: true },
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req, { maxBodySize: 1024 })
    assert.deepEqual(await pikkuReq.data(), { ok: true })
  })

  test('json() rejects an oversized body', async () => {
    const req = fastifyRequest({
      headers: {
        'content-type': 'application/json',
        'content-length': '4096',
      },
      body: { padding: 'x'.repeat(4000) },
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req, { maxBodySize: 16 })
    await assert.rejects(async () => await pikkuReq.json(), {
      name: 'PayloadTooLargeError',
    })
  })

  test('arrayBuffer() rejects an oversized buffer', async () => {
    const req = fastifyRequest({
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.alloc(64),
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req, { maxBodySize: 16 })
    await assert.rejects(async () => await pikkuReq.arrayBuffer(), {
      name: 'PayloadTooLargeError',
    })
  })

  test('defaults to the shared 10MB limit when none is configured', async () => {
    const req = fastifyRequest({
      headers: {
        'content-type': 'application/json',
        'content-length': String(10 * 1024 * 1024 + 1),
      },
      body: { ok: true },
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req)
    await assert.rejects(async () => await pikkuReq.data(), {
      name: 'PayloadTooLargeError',
    })
  })

  test('a GET request is unaffected by the limit', async () => {
    const req = fastifyRequest({
      method: 'GET',
      url: '/upload?a=1',
      query: { a: '1' },
      headers: { 'content-length': '4096' },
      body: undefined,
    })
    const pikkuReq = new FastifyPikkuHTTPRequest(req, { maxBodySize: 16 })
    assert.deepEqual(await pikkuReq.data(), { a: '1' })
  })
})
