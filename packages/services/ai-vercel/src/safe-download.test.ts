import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { safeDownload } from './safe-download.js'
import { VercelAIAgentRunner } from './vercel-ai-agent-runner.js'

/**
 * The AI SDK downloads attachment URLs *server-side* whenever the model does not
 * support the URL natively, using an unguarded `fetch`. Since the generated agent
 * HTTP surface accepts caller-supplied attachment URLs, that is a reachable SSRF
 * vector unless the download is routed through `safeFetch`.
 */
describe('safeDownload', () => {
  const download = safeDownload()

  const attempt = (url: string, isUrlSupportedByModel = false) =>
    download([{ url: new URL(url), isUrlSupportedByModel }])

  test('refuses the cloud metadata endpoint', async () => {
    await assert.rejects(
      () => attempt('http://169.254.169.254/latest/meta-data/iam/'),
      /private|internal/i
    )
  })

  test('refuses loopback and private ranges', async () => {
    for (const url of [
      'http://127.0.0.1:8080/admin',
      'http://localhost/internal',
      'http://10.0.0.5/secret',
      'http://192.168.1.1/router',
    ]) {
      await assert.rejects(() => attempt(url), /private|internal/i, url)
    }
  })

  test('refuses non-HTTP schemes', async () => {
    await assert.rejects(() => attempt('file:///etc/passwd'), /non-HTTP/i)
  })

  test('passes a model-supported URL through without fetching it', async () => {
    const result = await attempt('https://example.com/cat.png', true)
    assert.deepEqual(result, [null])
  })
})

describe('VercelAIAgentRunner attachment host allowlist', () => {
  test('withApiKey carries the allowlist onto the derived runner', () => {
    const factory = (apiKey: string) => ({ openai: { apiKey } })
    const runner = new VercelAIAgentRunner({}, factory, ['cdn.example.com'])

    const scoped = runner.withApiKey('secret-123') as unknown as {
      allowedAttachmentHosts?: string[]
    }

    assert.deepEqual(scoped.allowedAttachmentHosts, ['cdn.example.com'])
  })
})
