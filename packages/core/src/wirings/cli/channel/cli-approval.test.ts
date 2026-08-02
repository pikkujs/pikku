import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import {
  APPROVAL_FLAGS,
  approverForMode,
  createTerminalApprover,
  takeApprovalFlags,
} from './cli-approval.js'

/** stdin/stderr stand-ins: an emitter to feed keystrokes, a buffer to read. */
const fakeIO = () => {
  const input = new EventEmitter() as any
  input.off = input.removeListener.bind(input)
  input.pause = () => {}
  const written: string[] = []
  const output = { write: (s: string) => void written.push(s) } as any
  return { input, output, written }
}

describe('takeApprovalFlags', () => {
  test('no flag is the prompting mode', () => {
    assert.deepEqual(takeApprovalFlags(['deploy', '--stage', 'prod'], {}), {
      mode: 'prompt',
      args: ['deploy', '--stage', 'prod'],
    })
  })

  test('the flags are stripped before argv reaches the server', () => {
    // The server owns the command tree and has never heard of these. More to
    // the point, the decision of what may run on this machine is this
    // machine's — a flag the server can see is one the server could act on.
    const { mode, args } = takeApprovalFlags(
      ['deploy', APPROVAL_FLAGS.auto, '--stage', 'prod'],
      {}
    )
    assert.equal(mode, 'auto')
    assert.deepEqual(args, ['deploy', '--stage', 'prod'])
  })

  test('dangerous wins over auto however it was asked for', () => {
    assert.equal(
      takeApprovalFlags([APPROVAL_FLAGS.auto, APPROVAL_FLAGS.dangerous], {})
        .mode,
      'dangerous'
    )
    assert.equal(
      takeApprovalFlags([], { PIKKU_DANGEROUSLY_AUTO_APPROVE: '1' }).mode,
      'dangerous'
    )
    assert.equal(
      takeApprovalFlags([], { PIKKU_AUTO_APPROVE: '1' }).mode,
      'auto'
    )
  })
})

describe('approverForMode', () => {
  test('auto has nobody to ask, so approval-needing calls are refused', () => {
    // Not a silent yes: undefined is what the responder reads as "there is
    // nobody to ask", and it refuses rather than running.
    assert.equal(approverForMode('auto', { isTTY: true }), undefined)
  })

  test('a non-interactive run refuses rather than assuming yes', () => {
    // CI is exactly where an unattended push would otherwise happen.
    assert.equal(approverForMode('prompt', { isTTY: false }), undefined)
  })

  test('dangerous approves everything and says so once', async () => {
    const warnings: string[] = []
    const approve = approverForMode('dangerous', {
      isTTY: false,
      warn: (m) => warnings.push(m),
    })

    assert.ok(approve)
    assert.equal(await approve({ funcName: 'localPush', data: {} }), true)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /without asking/)
  })
})

describe('createTerminalApprover', () => {
  const answer = async (
    approve: ReturnType<typeof createTerminalApprover>,
    io: ReturnType<typeof fakeIO>,
    key: string,
    funcName = 'localPush'
  ) => {
    const asked = approve({ funcName, data: {} })
    setImmediate(() => io.input.emit('data', `${key}\n`))
    return asked
  }

  test('y allows, n refuses', async () => {
    const io = fakeIO()
    const approve = createTerminalApprover(io)

    assert.equal(await answer(approve, io, 'y'), true)
    assert.equal(await answer(approve, io, 'n'), false)
  })

  test('the prompt goes to stderr and names what is being asked', async () => {
    const io = fakeIO()
    const approve = createTerminalApprover(io)

    const asked = approve({
      funcName: 'localPush',
      data: {},
      description: 'push tag v2.1.0 to origin',
    })
    setImmediate(() => io.input.emit('data', 'y\n'))
    await asked

    // stderr so a command whose stdout is being piped still shows the prompt
    // rather than corrupting the stream it is asking about.
    const prompt = io.written.join('')
    assert.match(prompt, /push tag v2\.1\.0 to origin/)
    assert.match(prompt, /localPush/)
  })

  test('always is remembered for that capability only', async () => {
    const io = fakeIO()
    const approve = createTerminalApprover(io)

    assert.equal(await answer(approve, io, 'a', 'gitHead'), true)
    io.written.length = 0

    // No keystroke is sent: a second `gitHead` must not ask again.
    assert.equal(await approve({ funcName: 'gitHead', data: {} }), true)
    assert.deepEqual(io.written, [], 'the remembered answer asks nothing')

    // ...but a different capability still does. Widening "always" to the whole
    // session would quietly turn an interactive run into --dangerously-auto-approve.
    assert.equal(await answer(approve, io, 'n', 'localPush'), false)
    assert.match(io.written.join(''), /localPush/)
  })

  test('a prompt left open when the run ends stops waiting', async () => {
    const io = fakeIO()
    const ended = new AbortController()
    const approve = createTerminalApprover({ ...io, signal: ended.signal })

    const asked = approve({ funcName: 'localPush', data: {} })
    // Nothing is typed. The listener would otherwise hold the event loop open
    // and the process would never exit after the command finished.
    ended.abort()

    assert.equal(await asked, false, 'an abandoned prompt is a refusal')
    assert.equal(io.input.listenerCount('data'), 0, 'the listener is released')
  })
})
