import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cronOf,
  dropUnpublished,
  namespacesUsed,
  runSetup,
  startFile,
  triggerOf,
  wiredPackages,
} from './import-n8n-next.js'

describe('triggerOf', () => {
  test('a webhook keeps its path and method', () => {
    const t = triggerOf({
      nodes: [
        {
          type: 'n8n-nodes-base.webhook',
          parameters: { path: '/gm/', httpMethod: 'POST' },
        },
      ],
    })
    assert.deepEqual(t, { kind: 'webhook', path: 'gm', method: 'post' })
  })
  test('a webhook without a method is a GET, like n8n', () => {
    const t = triggerOf({
      nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'x' } }],
    })
    assert.deepEqual(t, { kind: 'webhook', path: 'x', method: 'get' })
  })
  test('a manual trigger, a chat trigger and no trigger are all "manual"', () => {
    for (const type of [
      'n8n-nodes-base.manualTrigger',
      '@n8n/n8n-nodes-langchain.chatTrigger',
    ])
      assert.deepEqual(triggerOf({ nodes: [{ type }] }), { kind: 'manual' })
    assert.deepEqual(triggerOf({ nodes: [] }), { kind: 'manual' })
  })
  test('a schedule trigger becomes a cron', () => {
    const t = triggerOf({
      nodes: [
        {
          type: 'n8n-nodes-base.scheduleTrigger',
          parameters: {
            rule: { interval: [{ field: 'hours', hoursInterval: 2 }] },
          },
        },
      ],
    })
    assert.deepEqual(t, { kind: 'schedule', cron: '0 */2 * * *' })
  })
  test('a schedule it cannot convert falls back to a manual start', () => {
    const t = triggerOf({
      nodes: [
        {
          type: 'n8n-nodes-base.scheduleTrigger',
          parameters: {
            rule: {
              interval: [
                { field: 'cronExpression', expression: '={{ $now }}' },
              ],
            },
          },
        },
      ],
    })
    assert.deepEqual(t, { kind: 'manual' })
  })
})

describe('cronOf', () => {
  test('days, weeks, minutes, legacy cron node', () => {
    const rule = (r: object) => ({ parameters: { rule: { interval: [r] } } })
    assert.equal(
      cronOf(rule({ field: 'days', daysInterval: 1, triggerAtHour: 9 })),
      '0 9 */1 * *'
    )
    assert.equal(
      cronOf(rule({ field: 'weeks', triggerAtDay: [1], triggerAtHour: 6 })),
      '0 6 * * 1'
    )
    assert.equal(
      cronOf(rule({ field: 'minutes', minutesInterval: 15 })),
      '*/15 * * * *'
    )
    assert.equal(
      cronOf({
        parameters: { triggerTimes: { item: [{ mode: 'everyDay', hour: 7 }] } },
      }),
      '0 7 * * *'
    )
  })
})

describe('startFile', () => {
  test('an HTTP start calls the workflow by its literal name, rpc from the third argument', () => {
    const { code, wiring } = startFile('Gmail Ops', 'gmailOps', {
      kind: 'webhook',
      path: 'gm',
      method: 'post',
    })
    assert.equal(wiring, 'http post /gm')
    assert.match(code, /rpc\.startWorkflow\("Gmail Ops", data\)/)
    assert.match(code, /async \(_services, data: any, \{ rpc \}\)/)
    assert.match(
      code,
      /wireHTTP\(\{ method: "post", route: "\/gm", auth: false, func: startGmailOps \}\)/
    )
    assert.doesNotMatch(code, /as never/)
  })
  test('a manual start is a POST on the kebab-cased slug', () => {
    assert.equal(
      startFile('x', 'mergeModes', { kind: 'manual' }).wiring,
      'http post /merge-modes'
    )
  })
  test('a schedule start uses wireScheduler', () => {
    const { code, wiring } = startFile('Weekly', 'weekly', {
      kind: 'schedule',
      cron: '0 6 * * 1',
    })
    assert.equal(wiring, 'schedule 0 6 * * 1')
    assert.match(
      code,
      /wireScheduler\(\{ name: "weekly", schedule: "0 6 \* \* 1", func: startWeekly \}\)/
    )
  })
})

describe('addon bookkeeping', () => {
  const gen = `import { wireAddon } from '@pikku/core/addon'

wireAddon({
  name: "pipedrive-account",
  package: "@pikku/addon-pipedrive",
  credentialOverrides: { "pipedrive": "pipedrive-account" },
})

wireAddon({
  name: "slack-a",
  package: "@pikku/addon-slack",
})
`
  test('wiredPackages lists instance and package', () => {
    assert.deepEqual(wiredPackages(gen), [
      { name: 'pipedrive-account', pkg: '@pikku/addon-pipedrive' },
      { name: 'slack-a', pkg: '@pikku/addon-slack' },
    ])
  })
  test('dropUnpublished removes only the unpublished instances; none left -> undefined', () => {
    const rest = dropUnpublished(gen, new Set(['@pikku/addon-pipedrive']))!
    assert.doesNotMatch(rest, /pipedrive/)
    assert.match(rest, /slack-a/)
    assert.match(rest, /import \{ wireAddon \}/)
    assert.equal(
      dropUnpublished(
        gen,
        new Set(['@pikku/addon-pipedrive', '@pikku/addon-slack'])
      ),
      undefined
    )
  })
  test('namespacesUsed reads the graph node functions', () => {
    const files = {
      'a/a.graph.ts': `nodes: { x: "gmail:messageSend", y: "graph:sort", z: "stubFn" }`,
    }
    assert.deepEqual([...namespacesUsed(files)].sort(), ['gmail', 'graph'])
  })
})

describe('runSetup', () => {
  test('installs each addon once, type-checks, and reports what is missing and what is a stub', () => {
    const calls: string[] = []
    const out: string[] = []
    runSetup(
      (args) => {
        calls.push(args.join(' '))
        if (args[0] === 'addons')
          return {
            code: 0,
            out: 'bun add\nFill these in:\n  secret GMAIL_APP_CREDENTIALS\n  credential gmailOAuth (each user connects their own)\n',
          }
        if (args[0] === 'all')
          return {
            code: 0,
            out: '◇◆ pikku ::\n  • 4 Workflows\nType check passed — no errors.\n',
          }
        return {
          code: 0,
          out: '◇◆ pikku ::\n{"nodes":{"a":{},"b":{}},"missingRequiredInputs":{"a":["to"]},"stubs":["b"]}',
        }
      },
      ['graph', 'gmail', 'graph'],
      ['Gmail Ops'],
      (m) => out.push(m)
    )
    assert.deepEqual(calls, [
      'addons add graph',
      'addons add gmail',
      'all --tsc-summary',
      'meta workflows get Gmail Ops',
    ])
    const text = out.join('\n')
    assert.match(
      text,
      /addons add gmail: ok\n\s+Fill these in:\n\s+secret GMAIL_APP_CREDENTIALS/
    )
    assert.match(text, /pikku all --tsc-summary: ok\nType check passed/)
    assert.doesNotMatch(text, /4 Workflows/)
    assert.match(
      text,
      /"Gmail Ops" \(2 nodes\)\n\s+a: missing required to\n\s+stubs: b/
    )
  })
  test('a failing install and a clean graph are said plainly', () => {
    const out: string[] = []
    runSetup(
      (args) =>
        args[0] === 'addons'
          ? { code: 1, out: 'not found' }
          : args[0] === 'all'
            ? { code: 1, out: 'Type check: 1 error' }
            : { code: 0, out: '{"nodes":{"a":{}}}' },
      ['nope'],
      ['W'],
      (m) => out.push(m)
    )
    const text = out.join('\n')
    assert.match(text, /addons add nope: FAILED\nnot found/)
    assert.match(text, /pikku all --tsc-summary: FAILED/)
    assert.match(text, /nothing missing/)
  })
})
