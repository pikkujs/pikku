import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  FabricChangesAskInput,
  renderChangesAsk,
} from './changes-ask.function.js'
import { renderChangesClaim } from './changes-claim.function.js'
import { namedBranch, renderChangesDone } from './changes-done.function.js'
import { renderChangesList } from './changes-list.function.js'
import { renderChangesShot } from './changes-shot.function.js'
import { renderChangesShow } from './changes-show.function.js'

/**
 * The renderers print RPC-provided text to a terminal, so what they write is
 * the thing under test. Everything they are handed here is what the API would
 * return — including the escape sequences a filer can type into a title.
 */
const printed = (render: () => void): string => {
  const lines: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    render()
  } finally {
    console.log = log
  }
  return lines.join('\n')
}

const HOSTILE = 'Totals\x1b[2J\x1b]0;owned\x07'

const change = (over: Record<string, unknown> = {}) => ({
  changeId: 'chg_1',
  shortId: '12',
  title: 'Grouped totals',
  status: 'open',
  held: false,
  route: '/checkout',
  groupId: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  capture: { elements: [] },
  ...over,
})

describe('changes ask', () => {
  test('refuses a question that says nothing', () => {
    assert.strictEqual(
      FabricChangesAskInput.safeParse({ changeId: 'chg_1', question: '' })
        .success,
      false
    )
    assert.strictEqual(
      FabricChangesAskInput.safeParse({ changeId: 'chg_1', question: '   ' })
        .success,
      false
    )
  })

  test('trims a question before it travels', () => {
    const parsed = FabricChangesAskInput.parse({
      changeId: 'chg_1',
      question: '  Grouped or per-line?  ',
    })
    assert.strictEqual(parsed.question, 'Grouped or per-line?')
  })

  test('neutralizes the echoed question', () => {
    const out = printed(() =>
      renderChangesAsk(null, { message: { body: HOSTILE } } as never)
    )
    assert.ok(!out.includes('\x1b'))
    assert.ok(out.includes('Totals[2J]0;owned'))
  })
})

describe('changes claim', () => {
  test('neutralizes the group title and the item titles', () => {
    const out = printed(() =>
      renderChangesClaim(null, {
        group: { groupId: 'grp_1', title: HOSTILE, claimExpiresAt: null },
        changes: [change({ title: HOSTILE })],
      } as never)
    )
    assert.ok(!out.includes('\x1b[2J'))
    assert.ok(!out.includes('\x1b]0;'))
  })
})

describe('changes done', () => {
  test('takes the checked-out branch', () => {
    assert.strictEqual(namedBranch('feat/thing'), 'feat/thing')
  })

  test('records no branch at all when HEAD is detached', () => {
    assert.strictEqual(namedBranch('HEAD'), undefined)
    assert.strictEqual(namedBranch(''), undefined)
  })

  test('prints the branch and the short sha it closed on', () => {
    const out = printed(() =>
      renderChangesDone(null, {
        change: {
          shortId: '12',
          branch: 'fix/totals',
          headCommit: 'abcdef1234567890',
        },
      } as never)
    )
    assert.ok(out.includes('#12 done'))
    assert.ok(out.includes('fix/totals @ abcdef1'))
  })
})

describe('changes list', () => {
  const lease = (minutes: number) =>
    printed(() =>
      renderChangesList(null, {
        changes: [change({ groupId: 'grp_1' })],
        groups: [
          {
            groupId: 'grp_1',
            title: 'Checkout totals',
            claimedBy: 'claude-code',
            claimExpiresAt: new Date(
              Date.now() + minutes * 60_000
            ).toISOString(),
          },
        ],
      } as never)
    )

  test('a held lease reads as the time it has left', () => {
    assert.ok(lease(30).includes('claimed by claude-code, 30m left'))
  })

  test('an expired lease does not read as negative time', () => {
    assert.ok(!lease(-30).includes('-30m'))
    assert.ok(lease(-30).includes('0m left'))
  })

  test('neutralizes a filed title and route', () => {
    const out = printed(() =>
      renderChangesList(null, {
        changes: [change({ title: HOSTILE, route: HOSTILE })],
        groups: [],
      } as never)
    )
    assert.ok(!out.includes('\x1b[2J'))
    assert.ok(!out.includes('\x1b]0;'))
  })

  // A title is printed as one field of one line, so a newline in it would end
  // that line and start another the response never contained.
  test('a title cannot forge a second row', () => {
    const out = printed(() =>
      renderChangesList(null, {
        changes: [change({ title: 'Grouped totals\n  #99  Ship it' })],
        groups: [],
      } as never)
    )
    assert.strictEqual(
      out.split('\n').filter((line) => line.includes('Ship it')).length,
      1
    )
    assert.ok(out.includes('Grouped totals  #99  Ship it'))
  })

  test('says so plainly when there is nothing open', () => {
    const out = printed(() =>
      renderChangesList(null, { changes: [], groups: [] } as never)
    )
    assert.ok(out.includes('Nothing open.'))
  })
})

describe('changes shot', () => {
  test('counts attachments rather than options, because evidence is not a choice', () => {
    const out = printed(() =>
      renderChangesShot(null, {
        message: { attachments: [{}, {}] },
        key: 'shots/1.png',
      } as never)
    )
    assert.ok(out.includes('2 attachments'))
    assert.ok(!out.includes('option'))
  })

  test('says one attachment in the singular', () => {
    const out = printed(() =>
      renderChangesShot(null, {
        message: { attachments: [{}] },
        key: 'shots/1.png',
      } as never)
    )
    assert.ok(out.includes('1 attachment in'))
  })
})

describe('changes show', () => {
  test('neutralizes the title, the body and the thread', () => {
    const out = printed(() =>
      renderChangesShow(null, {
        change: change({ title: HOSTILE, body: HOSTILE, gitSha: 'abc1234' }),
        thread: [
          {
            authorName: HOSTILE,
            authorKind: 'human',
            body: HOSTILE,
            createdAt: new Date().toISOString(),
            attachments: [{ kind: 'option', label: HOSTILE, url: null }],
            chosenOption: HOSTILE,
          },
        ],
        stageUrl: null,
      } as never)
    )
    assert.ok(!out.includes('\x1b[2J'))
    assert.ok(!out.includes('\x1b]0;'))
    assert.ok(out.includes('Totals[2J]0;owned'))
  })
})
