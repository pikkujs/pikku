import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildStepLadder,
  formatScenarioFailure,
  formatScenarioReport,
} from './scenario-formatter.js'

describe('formatScenarioFailure', () => {
  const failure = () => ({
    sentence: 'When  the shopper completes the checkout',
    message: 'Timed out waiting for selector button[title="Edit"]',
    stack:
      'Error: Timed out waiting for selector button[title="Edit"]\n' +
      '    at checksOut (/project/src/scenarios/checkout.steps.ts:71:5)\n' +
      '    at Runner.step (/project/node_modules/@pikku/core/dist/run.js:12:9)\n' +
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
  })

  test('the failing step, its message and its own frames are reported', () => {
    const block = formatScenarioFailure(failure(), {
      projectRoot: '/project',
    }).join('\n')

    assert.match(block, /failed at: When {2}the shopper completes the checkout/)
    assert.match(block, /Timed out waiting for selector/)
    assert.match(block, /checkout\.steps\.ts:71:5/)
  })

  test('framework and node frames are dropped, because they are never the bug', () => {
    const block = formatScenarioFailure(failure(), {
      projectRoot: '/project',
    }).join('\n')

    assert.doesNotMatch(block, /node_modules/)
    assert.doesNotMatch(block, /task_queues/)
  })

  test('--trace keeps every frame, for when the bug IS in the framework', () => {
    const block = formatScenarioFailure(failure(), {
      projectRoot: '/project',
      trace: true,
    }).join('\n')

    assert.match(block, /node_modules\/@pikku\/core/)
    assert.match(block, /task_queues/)
  })

  test('a stack with no project frames falls back to showing all of them', () => {
    const block = formatScenarioFailure(
      {
        message: 'boom',
        stack:
          'Error: boom\n    at inner (/elsewhere/node_modules/x/dist/a.js:1:1)',
      },
      { projectRoot: '/project' }
    ).join('\n')

    assert.match(block, /elsewhere/, 'some stack beats no stack')
  })

  test('an expected failure prints its message alone — a stack adds nothing', () => {
    const block = formatScenarioFailure(
      { ...failure(), expected: true },
      { projectRoot: '/project' }
    ).join('\n')

    assert.match(block, /Timed out waiting for selector/)
    assert.doesNotMatch(block, /checkout\.steps\.ts/)
  })

  test('the browser page is reported: where it was, and what it logged', () => {
    const block = formatScenarioFailure(
      {
        ...failure(),
        browser: [
          {
            actor: 'admin',
            url: 'http://localhost:4077/console/functions',
            consoleErrors: ['TypeError: x is not a function'],
            pageErrors: [],
            failedRequests: [],
            apiErrors: ['500 /api/rpc/console:readFunctionSource'],
            screenshot: '.pikku/scenario-failures/code-editor-admin.png',
          },
        ],
      },
      { projectRoot: '/project' }
    ).join('\n')

    assert.match(block, /browser \(admin\): http:\/\/localhost:4077\/console/)
    // Labels are padded to the widest of them, so the values line up.
    assert.match(block, /console: {4}TypeError: x is not a function/)
    assert.match(block, /api: {8}500 \/api\/rpc\/console:readFunctionSource/)
    assert.match(block, /screenshot: \.pikku\/scenario-failures/)
  })

  test('a clean browser window contributes only its url, not empty headings', () => {
    const block = formatScenarioFailure(
      {
        message: 'boom',
        browser: [
          {
            actor: 'admin',
            url: 'http://localhost:4077/console',
            consoleErrors: [],
            pageErrors: [],
            failedRequests: [],
            apiErrors: [],
          },
        ],
      },
      {}
    ).join('\n')

    assert.match(block, /browser \(admin\)/)
    assert.doesNotMatch(block, /console:/)
    assert.doesNotMatch(block, /api:/)
  })

  test('a scenario that failed outside any step still reports its message', () => {
    const block = formatScenarioFailure({ message: 'before hook failed' }, {})

    assert.equal(block.length, 1)
    assert.match(block[0]!, /before hook failed/)
  })
})

describe('formatScenarioReport', () => {
  const passing = () => ({
    name: 'a shopper checks out',
    status: 'passed' as const,
    durationMs: 412,
    steps: [
      {
        sentence: 'Given the shopper buys an apple',
        status: 'succeeded',
        durationMs: 12,
      },
    ],
  })

  const failing = () => ({
    name: 'a shopper sees a receipt',
    status: 'failed' as const,
    durationMs: 300,
    error: 'expected 1 item, got 0',
    steps: [
      {
        sentence: 'Then  the shopper sees the receipt',
        status: 'failed',
        error: 'expected 1 item, got 0',
      },
    ],
    failure: {
      sentence: 'Then  the shopper sees the receipt',
      message: 'expected 1 item, got 0',
    },
  })

  const render = (report: any) =>
    formatScenarioReport(report, { projectRoot: '/project' })

  test('a passing run reads as prose and ends with a count', () => {
    const lines = render({
      environment: 'local',
      results: [passing()],
      skipped: [],
      hookFailures: [],
    })

    assert.equal(lines[0]!.text, 'PASS a shopper checks out (412ms)')
    assert.match(lines[1]!.text, /Given the shopper buys an apple {2,}✓/)
    assert.equal(lines.at(-1)!.text, "1/1 scenarios passed against 'local'")
    assert.ok(
      lines.every((line) => line.level === 'info'),
      'nothing about a green run is an error'
    )
  })

  test('a failure is reported at error level, ladder included, block and all', () => {
    const lines = render({
      environment: 'local',
      results: [passing(), failing()],
      skipped: [],
      hookFailures: [],
    })

    const errors = lines.filter((line) => line.level === 'error')
    assert.match(errors[0]!.text, /^FAIL a shopper sees a receipt \(300ms\)/)
    assert.ok(
      errors.some((line) => /failed at: Then/.test(line.text)),
      'the failure block goes to the same stream as the failure'
    )
    assert.equal(lines.at(-1)!.text, "1/2 scenarios passed against 'local'")
  })

  test('skipped scenarios are named up front and counted in the summary', () => {
    const lines = render({
      environment: 'local',
      results: [passing()],
      skipped: [
        { name: 'codeEditorScenario', reason: 'browser steps, --no-browser' },
        { name: 'addonsScenario', reason: 'browser steps, --no-browser' },
      ],
      hookFailures: [],
    })

    assert.match(
      lines[0]!.text,
      /^SKIP codeEditorScenario \(browser steps, --no-browser\)$/
    )
    assert.equal(
      lines.at(-1)!.text,
      "1/1 scenarios passed against 'local', 2 skipped"
    )
  })

  test('a scenario skipped in code reports the reason it declared', () => {
    const lines = render({
      environment: 'local',
      results: [passing()],
      skipped: [
        {
          name: 'installAddonScenario',
          reason: 'mutates the project — needs a fresh server',
        },
      ],
      hookFailures: [],
    })

    assert.equal(
      lines[0]!.text,
      'SKIP installAddonScenario (mutates the project — needs a fresh server)'
    )
  })

  test('a feature hook failure belongs to no scenario, so it is counted apart', () => {
    const lines = render({
      environment: 'local',
      results: [passing()],
      skipped: [],
      hookFailures: ["feature 'Credential API' after hook failed: boom"],
    })

    assert.equal(
      lines.at(-2)!.text,
      "feature 'Credential API' after hook failed: boom"
    )
    assert.equal(lines.at(-2)!.level, 'error')
    assert.equal(
      lines.at(-1)!.text,
      "1/1 scenarios passed against 'local', 1 feature hook failure(s)"
    )
  })

  test('a scenario with no recorded steps still reports its own outcome', () => {
    const lines = render({
      environment: 'local',
      results: [
        {
          name: 'never started',
          status: 'failed' as const,
          durationMs: 0,
          error: 'before hook failed',
          failure: { message: 'before hook failed' },
        },
      ],
      skipped: [],
      hookFailures: [],
    })

    assert.match(lines[0]!.text, /^FAIL never started \(0ms\): before hook/)
    assert.equal(lines.at(-1)!.text, "0/1 scenarios passed against 'local'")
  })
})

describe('formatScenarioReport with a multi-line error', () => {
  // A playwright timeout carries its whole call log in `message`. Printed
  // verbatim on the summary line and again on the ladder row, one failure says
  // the same paragraph three times and the ladder's columns stop lining up.
  const report = {
    environment: 'local',
    results: [
      {
        name: 'the admin sees an addon',
        status: 'failed' as const,
        durationMs: 16000,
        error:
          'locator.waitFor: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator(…)',
        steps: [
          {
            sentence: 'Then  the admin sees the addon',
            status: 'failed',
            error:
              'locator.waitFor: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator(…)',
          },
        ],
        failure: {
          sentence: 'Then  the admin sees the addon',
          message:
            'locator.waitFor: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator(…)',
        },
      },
    ],
    skipped: [],
    hookFailures: [],
  }

  test('the summary line and the ladder row stay one line each', () => {
    const lines = formatScenarioReport(report)

    const summary = lines.find((line) => line.text.startsWith('FAIL'))!
    assert.ok(
      !summary.text.includes('\n'),
      'a summary line that wraps is no longer a summary'
    )
    assert.match(summary.text, /Timeout 15000ms exceeded\.$/)

    const row = lines.find((line) => line.text.includes('✗'))!
    assert.ok(
      !row.text.includes('\n'),
      'the ladder is a table, not a paragraph'
    )
  })

  test('the failure block still carries the message in full', () => {
    const lines = formatScenarioReport(report)
    const block = lines.map((line) => line.text).join('\n')

    assert.match(block, /Call log:/)
    assert.match(block, /waiting for locator/)
  })
})
