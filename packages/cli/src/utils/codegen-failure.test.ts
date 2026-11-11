import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { codegenFailureDiagnostics, failureTail } from './codegen-failure.js'

// The stderr of a real `pikku all`, whose workflow step input was not exported.
const output = readFileSync(
  new URL('fixtures/codegen-failure-row-05.stderr.txt', import.meta.url),
  'utf8'
)

test('an unexported schema comes first with its file, PKU724 last', () => {
  const diagnostics = codegenFailureDiagnostics({ logged: [], output })
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    ['SCHEMA', 'PKU724']
  )
  assert.match(
    diagnostics[0]?.file ?? '',
    /packages\/functions\/src\/functions\/probe\/weekly-test-count\.workflow\.ts$/
  )
  assert.match(diagnostics[0]?.message ?? '', /'SendWeeklyTestCountInput'/)
  assert.match(diagnostics[0]?.message ?? '', /Available exports: send/)
})

test('no stack frames, no warnings, and a consequence keeps one line', () => {
  const text = JSON.stringify(codegenFailureDiagnostics({ logged: [], output }))
  assert.doesNotMatch(text, /\bat async\b|file:\/\//)
  assert.doesNotMatch(text, /PKU719|Delete the output directory/)
})

test('an error logged and printed is one diagnostic', () => {
  const logged = [
    "Could not find exported schema 'SendWeeklyTestCountInput' in /project/packages/functions/src/functions/probe/weekly-test-count.workflow.ts for SendWeeklyTestCountInput. Available exports: sendWeeklyTestCount, weeklyTestCount",
    'Schema generation failed for 1 schema',
    'Workflow allWorkflow (run 1-2) failed:\nError: [PKU724] no services',
  ]
  const diagnostics = codegenFailureDiagnostics({ logged, output })
  assert.equal(diagnostics.length, 2)
})

test('one bad import across many schemas is one diagnostic', () => {
  const reason = "The requested module 'x' does not provide an export named 'Y'"
  const [only, ...rest] = codegenFailureDiagnostics({
    logged: [
      `Could not convert Zod schema 'A': ${reason}`,
      `Could not convert Zod schema 'B': ${reason}`,
    ],
    output: '',
  })
  assert.deepEqual(rest, [])
  assert.equal(only?.message, `${reason} (2 schemas, first 'A')`)
})

test('the same missing module from many files is one diagnostic', () => {
  const diagnostics = codegenFailureDiagnostics({
    logged: [
      "Could not convert Zod schema 'A': Cannot find module '/m' imported from /a.ts",
      "Could not convert Zod schema 'B': Cannot find module '/m' imported from /b.ts",
    ],
    output: '',
  })
  assert.equal(diagnostics.length, 1)
})

test('a throw with nothing before it keeps its whole message and code', () => {
  const [only, ...rest] = codegenFailureDiagnostics({
    logged: [],
    output:
      'Workflow allWorkflow (run 1-2) failed:\nError: [PKU718] skew\nfix it\n    at x (y.js:1:1)\n',
  })
  assert.deepEqual(rest, [])
  assert.equal(only?.code, 'PKU718')
  assert.equal(only?.message, 'skew\nfix it')
})

test('colours do not hide an error', () => {
  const diagnostics = codegenFailureDiagnostics({
    logged: [],
    output: "\u001b[31mCould not convert Zod schema 'A': nope\u001b[39m\n",
  })
  assert.match(diagnostics[0]?.message ?? '', /^nope/)
})

test('an unreadable failure is left to the tail, without frames', () => {
  assert.deepEqual(
    codegenFailureDiagnostics({ logged: [], output: 'boom\n' }),
    []
  )
  assert.equal(failureTail('boom\n    at x (y.js:1:1)\n'), 'boom')
})
