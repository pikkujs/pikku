import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  buildFindingPayload,
  parseFindingJson,
  postFinding,
  renderReceipt,
  validateFinding,
  type FindingInput,
} from './finding.js'
import type { ReportEnvironment } from './report-environment.js'

const environment: ReportEnvironment = {
  packages: [
    { name: '@pikku/cli', version: '0.12.113', linked: false },
    { name: '@pikku/core', version: '0.12.113', linked: false },
  ],
  versionSkew: false,
  linkedFramework: false,
  node: 'v22.0.0',
  packageManager: 'yarn@4.1.0',
  platform: 'darwin-arm64',
}

const finding = (overrides: Partial<FindingInput> = {}): FindingInput => ({
  title: 'Deployed errors answer with the minifier name',
  kind: 'product',
  model: 'claude-opus-5',
  expected: 'the rpc to answer with PermissionDeniedError',
  actual: 'it answered with cn',
  workaround: 'matched on the status code instead of the name',
  ...overrides,
})

describe('validateFinding', () => {
  test('accepts a resolved product finding carrying a workaround', () => {
    assert.deepEqual(validateFinding(finding()), [])
  })

  test('a harness finding must name the skill that misled it', () => {
    const problems = validateFinding(finding({ kind: 'harness' }))

    assert.equal(problems.length, 1)
    assert.match(problems[0], /--skill/)
  })

  test('a harness finding naming its skill is accepted', () => {
    assert.deepEqual(
      validateFinding(
        finding({
          kind: 'harness',
          skill: 'pikku-feature',
          passage: 'Stage 4, the prebuild step',
        })
      ),
      []
    )
  })

  test('a resolved finding with neither workaround nor proposal is refused', () => {
    const problems = validateFinding(finding({ workaround: undefined }))

    assert.equal(problems.length, 1)
    assert.match(problems[0], /--workaround/)
  })

  test('a proposal stands in for a workaround', () => {
    assert.deepEqual(
      validateFinding(
        finding({
          workaround: undefined,
          proposal: 'keepNames in the bun bundler, as esbuild already does',
        })
      ),
      []
    )
  })

  test('an unresolved finding must carry what was tried', () => {
    const problems = validateFinding(
      finding({ unresolved: true, workaround: undefined })
    )

    assert.equal(problems.length, 1)
    assert.match(problems[0], /--tried/)
  })

  test('unresolved and a workaround contradict each other', () => {
    const problems = validateFinding(
      finding({ unresolved: true, tried: 'three dead ends' })
    )

    assert.equal(problems.length, 1)
    assert.match(problems[0], /no workaround was found/)
  })

  test('reports every problem at once', () => {
    const problems = validateFinding(
      finding({ kind: 'harness', unresolved: true })
    )

    assert.equal(problems.length, 3)
    assert.match(problems.join('\n'), /--skill/)
    assert.match(problems.join('\n'), /--tried/)
    assert.match(problems.join('\n'), /no workaround was found/)
  })
})

describe('buildFindingPayload', () => {
  test('renames run to runId and stamps the environment and time', () => {
    const payload = buildFindingPayload(
      finding({ run: 'build-42' }),
      environment,
      new Date('2026-08-29T10:00:00.000Z')
    )

    assert.equal(payload.runId, 'build-42')
    assert.equal('run' in payload, false)
    assert.equal(payload.reportedAt, '2026-08-29T10:00:00.000Z')
    assert.deepEqual(payload.environment, environment)
  })
})

describe('renderReceipt', () => {
  test('shows every field that left the machine', () => {
    const receipt = renderReceipt(
      buildFindingPayload(
        finding({
          command: 'pikku deploy',
          error: 'TypeError: e.getFullYear is not a function',
          surface: 'deployed',
          cost: '98s vs 20s steady state',
        }),
        environment
      )
    )

    assert.match(receipt, /Deployed errors answer with the minifier name/)
    assert.match(receipt, /command: pikku deploy/)
    assert.match(receipt, /error: TypeError: e\.getFullYear is not a function/)
    assert.match(receipt, /surface: deployed/)
    assert.match(receipt, /cost: 98s vs 20s steady state/)
    assert.match(receipt, /@pikku\/core@0\.12\.113/)
    assert.match(receipt, /model: claude-opus-5/)
  })

  test('omits fields that were not given rather than printing empties', () => {
    const receipt = renderReceipt(buildFindingPayload(finding(), environment))

    assert.equal(receipt.includes('command:'), false)
    assert.equal(receipt.includes('error:'), false)
    assert.equal(receipt.includes('cost:'), false)
  })

  test('marks an unresolved finding on its kind line', () => {
    const receipt = renderReceipt(
      buildFindingPayload(
        finding({
          unresolved: true,
          workaround: undefined,
          tried: 'two dead ends',
        }),
        environment
      )
    )

    assert.match(receipt, /kind: product \(unresolved\)/)
  })

  test('calls out a skewed tree and a linked framework', () => {
    const receipt = renderReceipt(
      buildFindingPayload(finding(), {
        ...environment,
        packages: [
          { name: '@pikku/cli', version: '0.12.35', linked: false },
          { name: '@pikku/core', version: '0.12.113', linked: true },
        ],
        versionSkew: true,
        linkedFramework: true,
      })
    )

    assert.match(receipt, /not all the same/)
    assert.match(receipt, /may be modified/)
    assert.match(receipt, /@pikku\/core@0\.12\.113 \(linked\)/)
  })
})

describe('parseFindingJson', () => {
  test('carries prose the shell would have mangled through intact', () => {
    const error =
      "TypeError: can't read `name` of undefined\n    at cn (index.js:1:8842)"
    const parsed = parseFindingJson(JSON.stringify(finding({ error })))

    assert.ok('finding' in parsed)
    assert.equal(parsed.finding.error, error)
  })

  test('names the malformed JSON rather than throwing', () => {
    const parsed = parseFindingJson('{ "title": ')

    assert.ok('problems' in parsed)
    assert.match(parsed.problems[0], /--stdin expected a JSON object/)
  })

  test('rejects JSON that is not an object', () => {
    const parsed = parseFindingJson('["a finding"]')

    assert.ok('problems' in parsed)
    assert.deepEqual(parsed.problems, ['--stdin expected a JSON object.'])
  })

  test('names every field that is missing or wrong, in one pass', () => {
    const parsed = parseFindingJson(
      JSON.stringify({ title: 'x', kind: 'typo', expected: 'y' })
    )

    assert.ok('problems' in parsed)
    const fields = parsed.problems.map((p) => p.split(':')[0])
    assert.deepEqual(fields.sort(), ['actual', 'kind', 'model'])
  })
})

async function withServer(
  handler: (
    body: string,
    headers: Record<string, string | string[] | undefined>
  ) => { status: number; delayMs?: number },
  run: (url: string) => Promise<void>
): Promise<void> {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const { status, delayMs } = handler(
        Buffer.concat(chunks).toString('utf8'),
        req.headers
      )
      const reply = () => {
        res.writeHead(status)
        res.end()
      }
      if (delayMs) setTimeout(reply, delayMs).unref()
      else reply()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as AddressInfo
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('postFinding', () => {
  test('posts the finding under its project with a bearer token', async () => {
    let seen: { body: string; auth?: string | string[] } | null = null

    await withServer(
      (body, headers) => {
        seen = { body, auth: headers.authorization }
        return { status: 202 }
      },
      async (apiUrl) => {
        const result = await postFinding({
          apiUrl,
          token: 'tok_123',
          projectId: 'prj_abc',
          payload: buildFindingPayload(finding(), environment),
        })

        assert.deepEqual(result, { sent: true })
      }
    )

    assert.equal(seen!.auth, 'Bearer tok_123')
    const parsed = JSON.parse(seen!.body)
    assert.equal(parsed.projectId, 'prj_abc')
    assert.equal(parsed.finding.title, finding().title)
    assert.equal(parsed.finding.environment.node, 'v22.0.0')
  })

  test('a refusal is reported, never thrown', async () => {
    await withServer(
      () => ({ status: 500 }),
      async (apiUrl) => {
        const result = await postFinding({
          apiUrl,
          token: 'tok_123',
          projectId: 'prj_abc',
          payload: buildFindingPayload(finding(), environment),
        })

        assert.equal(result.sent, false)
        assert.match(result.reason!, /500/)
      }
    )
  })

  test('a slow endpoint times out instead of holding up the build', async () => {
    await withServer(
      () => ({ status: 202, delayMs: 500 }),
      async (apiUrl) => {
        const result = await postFinding({
          apiUrl,
          token: 'tok_123',
          projectId: 'prj_abc',
          payload: buildFindingPayload(finding(), environment),
          timeoutMs: 20,
        })

        assert.equal(result.sent, false)
      }
    )
  })

  test('an unreachable endpoint is swallowed', async () => {
    const result = await postFinding({
      apiUrl: 'http://127.0.0.1:1',
      token: 'tok_123',
      projectId: 'prj_abc',
      payload: buildFindingPayload(finding(), environment),
      timeoutMs: 200,
    })

    assert.equal(result.sent, false)
    assert.ok(result.reason)
  })
})
