import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import extension from './codegen-diagnostics.mjs'

/** A pi stub that captures the one handler the extension registers. */
function load(logPath) {
  const previous = process.env.PIKKU_DEV_LOG
  process.env.PIKKU_DEV_LOG = logPath
  let handler = null
  extension({
    on: (event, fn) => {
      if (event === 'tool_result') handler = fn
    },
  })
  if (previous === undefined) delete process.env.PIKKU_DEV_LOG
  else process.env.PIKKU_DEV_LOG = previous
  return handler
}

function edit(path = '/p/src/foo.function.ts') {
  return { toolName: 'edit', isError: false, input: { path }, content: [{ type: 'text', text: 'ok' }] }
}

const text = (result) => result?.content?.at(-1)?.text ?? ''

function sandbox(run) {
  const dir = mkdtempSync(join(tmpdir(), 'codegen-diag-'))
  const log = join(dir, 'pikku-dev.log')
  const previous = process.env.PIKKU_DEV_LOG
  process.env.PIKKU_DEV_LOG = log
  try {
    run(log)
  } finally {
    if (previous === undefined) delete process.env.PIKKU_DEV_LOG
    else process.env.PIKKU_DEV_LOG = previous
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a PKU diagnostic written since the last edit is attached to it', () => {
  sandbox((log) => {
    writeFileSync(log, 'starting\n')
    const handler = load(log)
    appendFileSync(log, '[PKU574] exposed sessionless function carries no permission\n')
    assert.match(text(handler(edit())), /PKU574/)
  })
})

// The dev server boots first and its opening `pikku all` reports what the TEMPLATE
// already carries. Run 12 annotated the build's first edit with a PKU952 in generated
// scaffold — code the agent never wrote and must not touch.
test('diagnostics that predate the build are never blamed on its first edit', () => {
  sandbox((log) => {
    writeFileSync(log, '[PKU952] src/scaffold/console/console.gen.ts reads a secret\n')
    const handler = load(log)
    assert.equal(handler(edit()), undefined)
  })
})

// The rule that keeps the channel worth reading. A codegen failure persists across the
// several edits it takes to fix, and re-attaching it to each one teaches the agent that
// the text under an edit is noise — which is how a build ends up stripping a real
// permission to satisfy a diagnostic it stopped reading.
test('the same diagnostic is not re-attached to every later edit', () => {
  sandbox((log) => {
    writeFileSync(log, 'boot\n')
    const handler = load(log)
    appendFileSync(log, '[PKU574] no permission\n')
    assert.match(text(handler(edit())), /PKU574/)
    assert.equal(handler(edit()), undefined)
    assert.equal(handler(edit()), undefined)
  })
})

// The one run 13 exposed. Every file change re-runs codegen, so an error that is still
// unfixed is written to the log again as NEW bytes — offset tracking cannot see that it
// is the same error, and the agent got the identical PKU952 under three consecutive edits.
test('an unchanged error re-emitted by each codegen pass is reported once', () => {
  sandbox((log) => {
    writeFileSync(log, 'boot\n')
    const handler = load(log)
    appendFileSync(log, '[PKU952] console.gen.ts reads a secret with a non-literal key\n')
    assert.match(text(handler(edit())), /PKU952/)
    for (let pass = 0; pass < 3; pass++) {
      appendFileSync(log, '[PKU952] console.gen.ts reads a secret with a non-literal key\n')
      assert.equal(handler(edit()), undefined)
    }
  })
})

test('a NEW error arriving after a repeated one still gets through', () => {
  sandbox((log) => {
    writeFileSync(log, 'boot\n')
    const handler = load(log)
    appendFileSync(log, '[PKU952] old news\n')
    handler(edit())
    appendFileSync(log, '[PKU952] old news\n[PKU124] Persona tom holds role rep\n')
    const attached = text(handler(edit()))
    assert.match(attached, /PKU124/)
    assert.doesNotMatch(attached, /PKU952/)
  })
})

test('one pass repeating a diagnostic per target reports it once', () => {
  sandbox((log) => {
    writeFileSync(log, 'boot\n')
    const handler = load(log)
    handler(edit())
    appendFileSync(log, '[PKU574] no permission\n[PKU574] no permission\n[PKU574] no permission\n')
    assert.equal(text(handler(edit())).match(/PKU574/g)?.length, 1)
  })
})

test('a clean codegen pass attaches nothing', () => {
  sandbox((log) => {
    writeFileSync(log, 'boot\n')
    const handler = load(log)
    handler(edit())
    appendFileSync(log, 'pikku all (completed in 0ms)\n  • 17 HTTP routes\n')
    assert.equal(handler(edit()), undefined)
  })
})

// Never blocks and never throws: a run with no dev server (a knowledge turn, a lab
// misconfiguration) must be indistinguishable from a clean pass, not an error on
// every edit.
test('no dev log at all is silent rather than an error', () => {
  sandbox(() => {
    const handler = load(join(tmpdir(), 'does-not-exist', 'pikku-dev.log'))
    assert.equal(handler(edit()), undefined)
  })
})

test('a rotated (truncated) log does not replay as new output', () => {
  sandbox((log) => {
    writeFileSync(log, `${'x'.repeat(500)}\n`)
    const handler = load(log)
    appendFileSync(log, '[PKU574] no permission\n')
    assert.match(text(handler(edit())), /PKU574/)
    writeFileSync(log, 'fresh\n')
    assert.equal(handler(edit()), undefined)
  })
})

test('only source files are considered', () => {
  sandbox((log) => {
    writeFileSync(log, '[PKU574] no permission\n')
    const handler = load(log)
    assert.equal(handler(edit('/p/db/sqlite/0004-deal.sql')), undefined)
    assert.equal(handler(edit('/p/knowledge/entities/pipeline.md')), undefined)
  })
})

test('a failed edit is not annotated', () => {
  sandbox((log) => {
    writeFileSync(log, '[PKU574] no permission\n')
    const handler = load(log)
    assert.equal(handler({ ...edit(), isError: true }), undefined)
  })
})
