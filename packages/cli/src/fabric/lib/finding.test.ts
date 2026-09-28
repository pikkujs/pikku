import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFindingPayload,
  findingRPC,
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
          skill: 'pikku-build',
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
  test('carries the run id and stamps the environment and time', () => {
    const payload = buildFindingPayload(
      finding(),
      environment,
      'build-42',
      new Date('2026-08-29T10:00:00.000Z')
    )

    assert.equal(payload.runId, 'build-42')
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
          deployTarget: 'cloudflare',
        }),
        environment,
        'run_412',
        new Date('2026-08-29T14:02:11.000Z')
      )
    )

    assert.match(receipt, /Deployed errors answer with the minifier name/)
    assert.match(receipt, /command: pikku deploy/)
    assert.match(receipt, /error: TypeError: e\.getFullYear is not a function/)
    assert.match(receipt, /surface: deployed/)
    assert.match(receipt, /run: run_412/)
    assert.match(receipt, /deploy target: cloudflare/)
    assert.match(receipt, /reported at: 2026-08-29T14:02:11\.000Z/)
    assert.match(receipt, /cost: 98s vs 20s steady state/)
    assert.match(receipt, /@pikku\/core@0\.12\.113/)
    assert.match(receipt, /model: claude-opus-5/)
  })

  test('omits fields that were not given rather than printing empties', () => {
    const receipt = renderReceipt(
      buildFindingPayload(finding(), environment, 'run_1')
    )

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
        environment,
        'run_1'
      )
    )

    assert.match(receipt, /kind: product \(unresolved\)/)
  })

  test('calls out a skewed tree and a linked framework', () => {
    const receipt = renderReceipt(
      buildFindingPayload(
        finding(),
        {
          ...environment,
          packages: [
            { name: '@pikku/cli', version: '0.12.35', linked: false },
            { name: '@pikku/core', version: '0.12.113', linked: true },
          ],
          versionSkew: true,
          linkedFramework: true,
        },
        'run_1'
      )
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

const payload = () => buildFindingPayload(finding(), environment, 'run_1')

describe('postFinding', () => {
  test('submits the finding through submitFinding', async () => {
    const invoked: { name: string; data: any }[] = []
    const rpc = {
      invoke: async (name: string, data: unknown) => {
        invoked.push({ name, data })
        return { findingId: 'f_1' }
      },
    } as any

    const result = await postFinding({ rpc, payload: payload() })

    assert.deepEqual(result, { sent: true })
    assert.equal(invoked.length, 1)
    assert.equal(invoked[0]!.name, 'submitFinding')
    assert.deepEqual(Object.keys(invoked[0]!.data), ['finding'])
    assert.equal(invoked[0]!.data.finding.runId, 'run_1')
    assert.equal(invoked[0]!.data.finding.title, finding().title)
    assert.equal(invoked[0]!.data.finding.environment.node, 'v22.0.0')
  })

  test('a refusal is reported, never thrown', async () => {
    const rpc = {
      invoke: async () => {
        throw Object.assign(new Error('Internal Server Error'), { status: 500 })
      },
    } as any

    const result = await postFinding({ rpc, payload: payload() })

    assert.equal(result.sent, false)
    assert.match(result.reason!, /500/)
  })

  test('an unreachable endpoint is swallowed', async () => {
    const rpc = {
      invoke: async () => {
        throw new TypeError('fetch failed')
      },
    } as any

    const result = await postFinding({ rpc, payload: payload() })

    assert.deepEqual(result, { sent: false, reason: 'fetch failed' })
  })
})

describe('findingRPC', () => {
  test('posts to the rpc route with no credentials', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const send = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response('{"findingId":"f_1"}', {
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await findingRPC('https://api.example', 5000, send).invoke(
      'submitFinding',
      { finding: payload() as any }
    )

    assert.equal(seen!.url, 'https://api.example/rpc/submitFinding')
    assert.equal(
      (seen!.init.headers as Record<string, string>).Authorization,
      undefined
    )
    assert.ok(seen!.init.signal)
  })

  test('a slow endpoint times out instead of holding up the build', async () => {
    const send = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () =>
          reject(init.signal!.reason)
        )
      )) as unknown as typeof fetch

    const result = await postFinding({
      rpc: findingRPC('https://api.example', 20, send),
      payload: payload(),
    })

    assert.equal(result.sent, false)
  })
})
