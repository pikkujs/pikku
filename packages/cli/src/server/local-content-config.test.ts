import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLocalContentConfig } from './local-content-config.js'

const base = {
  appContent: undefined,
  projectContent: undefined,
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
      projectContent: {
        contentPath: 'files',
        assetUrlPrefix: '/content',
        sizeLimit: '10mb',
      },
    })
    assert.equal(resolved.sizeLimit, '10mb')
    assert.equal(resolved.assetUrlPrefix, '/content')
    assert.equal(resolved.localFileUploadPath, '/app/files')
  })

  test('createConfig wins key by key', () => {
    const resolved = resolveLocalContentConfig({
      ...base,
      appContent: { sizeLimit: '50mb' },
      projectContent: { sizeLimit: '10mb', assetUrlPrefix: '/content' },
    })
    assert.equal(resolved.sizeLimit, '50mb')
    assert.equal(resolved.assetUrlPrefix, '/content')
  })
})
