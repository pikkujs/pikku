import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { workflowInputHint } from './tsc-check.js'

const file = (text: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-hint-'))
  writeFileSync(join(dir, 'w.ts'), text)
  return dir
}

describe('workflowInputHint', () => {
  test('a TS2769 on a workflow.do names the function and points at meta', () => {
    const dir = file(
      "await workflow.do('Welcome', 'slack:chatPostMessage', { channel: 'x' })\n"
    )
    const hint = workflowInputHint(
      {
        file: 'w.ts',
        line: 1,
        code: 'TS2769',
        message: 'No overload matches this call.',
      },
      dir
    )
    assert.match(hint!, /step name 'slack:chatPostMessage' is fine/)
    assert.match(hint!, /pikku meta functions get slack:chatPostMessage/)
  })
  test('works when the call spans lines (the error is on the step-name line)', () => {
    const dir = file(
      "await workflow.do(\n  'Welcome',\n  'sendgrid:mailSend',\n  { x: 1 }\n)\n"
    )
    assert.ok(
      workflowInputHint(
        {
          file: 'w.ts',
          line: 3,
          code: 2769,
          message: 'No overload matches this call.',
        },
        dir
      )
    )
  })
  test('no hint for other codes or other calls', () => {
    const dir = file("const x = foo('a', 'b')\n")
    assert.equal(
      workflowInputHint(
        { file: 'w.ts', line: 1, code: 'TS2769', message: 'No overload' },
        dir
      ),
      null
    )
    assert.equal(
      workflowInputHint(
        { file: 'w.ts', line: 1, code: 'TS2345', message: 'x' },
        dir
      ),
      null
    )
    assert.equal(
      workflowInputHint(
        { file: 'missing.ts', line: 1, code: 'TS2769', message: 'x' },
        dir
      ),
      null
    )
  })
})
