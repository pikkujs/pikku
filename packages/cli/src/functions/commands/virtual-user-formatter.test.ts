import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { formatVirtualUserReport } from './virtual-user-formatter.js'
import type { VirtualUserRunResult } from '@pikku/core/ecosystem/virtual-user'

const context = {
  persona: 'orgAdmin',
  disposition: 'careless',
  environment: 'staging',
  apiUrl: 'https://api.example.com/api',
  catalogue: { total: 430, annotated: 78, inferred: 352 },
}

const result = (
  overrides: Partial<VirtualUserRunResult> = {}
): VirtualUserRunResult => ({
  seed: 4242,
  tally: {
    steps: 12,
    calls: 8,
    mutations: 3,
    tokensIn: 4102,
    tokensOut: 812,
    model: 'openai/gpt-5-mini',
    elapsedMs: 41_000,
    findings: 0,
  },
  findings: [],
  intents: [],
  steps: [],
  memory: {},
  stoppedBy: 'budget-steps',
  ...overrides,
})

const render = (run: VirtualUserRunResult) =>
  formatVirtualUserReport(run, context)

const text = (run: VirtualUserRunResult) =>
  render(run)
    .map((line) => line.text)
    .join('\n')

describe('the virtual user report', () => {
  test('leads with who it was, where, and how to replay it', () => {
    const report = text(result())
    assert.match(report, /Virtual user 'orgAdmin' \(careless\)/)
    assert.match(report, /'staging' — https:\/\/api\.example\.com\/api/)
    assert.match(report, /seed 4242/)
  })

  test('says how much of the read/write split was guesswork', () => {
    assert.match(text(result()), /read\/write guessed for 352 of them/)
  })

  test('and says nothing about it when the project annotated everything', () => {
    const lines = formatVirtualUserReport(result(), {
      ...context,
      catalogue: { total: 12, annotated: 12, inferred: 0 },
    })
    assert.ok(!lines.some((line) => line.text.includes('guessed')))
  })

  test('a clean run says so plainly, without claiming anything was proved', () => {
    const report = text(result())
    assert.match(report, /Nothing came back that should not have\./)
    assert.ok(!report.includes('PASS'))
  })

  test('findings are errors, so a pipeline sees them', () => {
    const lines = render(
      result({
        findings: [
          {
            kind: 'server-error',
            detail: 'createProject returned 500',
            rpcName: 'createProject',
            status: 500,
            step: 7,
          },
        ],
      })
    )
    const errors = lines.filter((line) => line.level === 'error')
    assert.equal(errors.length, 2)
    assert.match(errors[0]!.text, /^1 finding$/)
    assert.match(
      errors[1]!.text,
      /server-error\s+createProject returned 500 \(step 7\)/
    )
  })

  test('a run with something to show tells you how to get back to it', () => {
    const report = text(
      result({
        findings: [{ kind: 'server-error', detail: 'boom', step: 1 }],
      })
    )
    assert.match(report, /Replay this exact run with --seed 4242\./)
  })

  test('a clean run does not, because there is nothing to reproduce', () => {
    assert.ok(!text(result()).includes('Replay'))
  })

  test('each intent reports what became of it, interruptions and all', () => {
    const report = text(
      result({
        intents: [
          {
            id: 'i1',
            sourceId: 'inviteFlow',
            title: 'Invite a teammate',
            status: 'completed',
            steps: [0, 1, 2],
            suspensions: 2,
            summary: 'sent the invite',
          },
          {
            id: 'i2',
            sourceId: 'billing',
            title: 'Change the plan',
            status: 'abandoned',
            steps: [3],
            suspensions: 0,
          },
        ],
      })
    )
    assert.match(
      report,
      /DONE\s+Invite a teammate \(3 steps, put down 2 times\) — sent the invite/
    )
    assert.match(report, /DROP\s+Change the plan \(1 step\)/)
  })

  test('the tally is one line, and no line of it is money', () => {
    const report = text(result())
    assert.match(
      report,
      /12 steps · 8 calls · 3 mutations · 4102\/812 tokens \(openai\/gpt-5-mini\) · 41s/
    )
    assert.ok(!/\$|cost|spend/i.test(report))
  })

  test('why it ended is said in words', () => {
    assert.match(text(result()), /Stopped because it ran out of steps\./)
    assert.match(
      text(result({ stoppedBy: 'exhausted' })),
      /saw everything it came for through/
    )
  })

  test('a user with nothing to want is warned, not silently reported as clean', () => {
    const lines = render(result({ stoppedBy: 'no-intents' }))
    const warning = lines.find((line) => line.level === 'warn')
    assert.ok(warning)
    assert.match(
      warning!.text,
      /declare a scenario naming 'orgAdmin', or pass --goals/
    )
  })
})
