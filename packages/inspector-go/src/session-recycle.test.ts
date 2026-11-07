import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InspectorSession } from './session.js'

/** A `serve` that answers with its own pid and asks to be recycled on its second answer. */
const fakeServe = (): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'pikku-fake-serve-')), 'serve')
  writeFileSync(
    path,
    `#!/usr/bin/env node
let answered = 0
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let at
  while ((at = buffer.indexOf('\\n')) >= 0) {
    const request = JSON.parse(buffer.slice(0, at))
    buffer = buffer.slice(at + 1)
    answered++
    const reply = { id: request.id, result: [{ pid: process.pid }] }
    if (answered === 2) reply.recycle = true
    process.stdout.write(JSON.stringify(reply) + '\\n')
  }
})
`
  )
  chmodSync(path, 0o755)
  return path
}

const pidOf = async (session: InspectorSession, n: number) =>
  ((await session.typeDiagnostics('/r', `f${n}.ts`)) as any)[0].pid as number

describe('InspectorSession recycle', () => {
  test('a recycle response retires the process; the next call starts a new one', async () => {
    const binary = fakeServe()
    const session = new InspectorSession(() => binary)
    try {
      const first = await pidOf(session, 1)
      const second = await pidOf(session, 2)
      const third = await pidOf(session, 3)
      assert.equal(first, second)
      assert.notEqual(third, second)
    } finally {
      session.close()
    }
  })

  test('requests already sent to the retired process still get their answers', async () => {
    const binary = fakeServe()
    const session = new InspectorSession(() => binary)
    try {
      const pids = await Promise.all([1, 2, 3].map((n) => pidOf(session, n)))
      assert.equal(pids[0], pids[1])
      assert.equal(pids[2], pids[1])
      assert.notEqual(await pidOf(session, 4), pids[0])
    } finally {
      session.close()
    }
  })
})
