import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  backendForContent,
  resolveLocalContentConfig,
} from './local-content-config.js'

const base = {
  appContent: undefined,
  rootContent: undefined,
  backendContent: undefined,
  rootDir: '/app',
  runtimeDir: undefined,
  server: 'http://localhost:4000',
}

describe('resolveLocalContentConfig', () => {
  test('a project that sets nothing gets the defaults', () => {
    assert.deepEqual(resolveLocalContentConfig(base), {
      localFileUploadPath: '/app/.pikku-runtime/content',
      uploadUrlPrefix: '/upload',
      assetUrlPrefix: '/assets',
      server: 'http://localhost:4000',
      sizeLimit: undefined,
    })
  })

  test('the pikku.config.json block is honoured', () => {
    const resolved = resolveLocalContentConfig({
      ...base,
      rootContent: { contentPath: 'files', sizeLimit: '10mb', buckets: ['a'] },
      backendContent: { assetUrlPrefix: '/content' },
    })
    assert.equal(resolved.sizeLimit, '10mb')
    assert.equal(resolved.assetUrlPrefix, '/content')
    assert.equal(resolved.localFileUploadPath, '/app/files')
  })

  test('createConfig wins key by key', () => {
    const resolved = resolveLocalContentConfig({
      ...base,
      appContent: { sizeLimit: '50mb' },
      rootContent: { sizeLimit: '10mb', buckets: ['a'] },
      backendContent: { assetUrlPrefix: '/content' },
    })
    assert.equal(resolved.sizeLimit, '50mb')
    assert.equal(resolved.assetUrlPrefix, '/content')
  })
})

describe('backendForContent', () => {
  const backends = {
    web: { content: { assetUrlPrefix: '/c' } },
    admin: {},
  }
  test('takes the named backend', () => {
    assert.deepEqual(backendForContent(backends, 'web', 'pikku serve'), {
      name: 'web',
      content: { assetUrlPrefix: '/c' },
    })
  })
  test('takes the only backend when none is named', () => {
    assert.deepEqual(
      backendForContent({ web: backends.web }, undefined, 'pikku serve'),
      { name: 'web', content: { assetUrlPrefix: '/c' } }
    )
  })
  test('refuses to guess between several backends', () => {
    assert.throws(
      () => backendForContent(backends, undefined, 'pikku serve'),
      /name one with --backend/
    )
  })
  test('names the declared backends for an unknown one', () => {
    assert.throws(
      () => backendForContent(backends, 'nope', 'pikku serve'),
      /Declared backends: web, admin/
    )
  })
})
