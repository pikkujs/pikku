import { describe, test } from 'node:test'
import assert from 'node:assert'
import { ChangesAskInput, renderChangesAsk } from './changes-ask.function.js'
import { renderChangesClaim } from './changes-claim.function.js'
import { namedBranch, renderChangesDone } from './changes-done.function.js'
import { renderChangesList } from './changes-list.function.js'
import { renderChangesShot } from './changes-shot.function.js'
import { renderChangesShow } from './changes-show.function.js'
import { renderChangesReply } from './changes-reply.function.js'
import { clockTime } from '../lib/changes.js'

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
  status: 'ready',
  held: false,
  route: '/checkout',
  groupId: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  capture: { elements: [] },
  ...over,
})

describe('changes ask', () => {
  test('rejects a seventh option', () => {
    assert.strictEqual(
      ChangesAskInput.safeParse({
        changeId: 'chg_1',
        question: 'Which?',
        option: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }).success,
      false
    )
  })

  test('echoes what the filer can click, neutralized', () => {
    const out = printed(() =>
      renderChangesAsk(null, {
        message: {
          body: 'Grouped or per-line?',
          attachments: [
            { key: 'grouped', label: 'Grouped', kind: 'option' },
            { key: 'hostile', label: HOSTILE, kind: 'option' },
            { key: 'shot', label: 'A screenshot', kind: 'evidence' },
          ],
        },
      } as never)
    )
    assert.ok(out.includes('they can click: Grouped · '))
    assert.ok(!out.includes('A screenshot'))
    assert.ok(!out.includes('\x1b'))
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

  test('a card in a live lease reads claimed by, until a clock time', () => {
    const out = lease(30)
    assert.match(out, /claimed by claude-code until \d\d:\d\d/)
  })

  test('a card whose lease lapsed is not shown as claimed', () => {
    const out = lease(-30)
    assert.doesNotMatch(out, /claimed by/)
    assert.doesNotMatch(out, /abandoned/)
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

  test('a held item says when it becomes claimable', () => {
    const at = new Date(Date.now() + 45_000)
    const out = printed(() =>
      renderChangesList(null, {
        changes: [change({ held: true, heldUntil: at.toISOString() })],
        groups: [],
      } as never)
    )
    assert.ok(out.includes(`claimable at ${clockTime(at)}`))
  })

  test('an older cloud without heldUntil still says held', () => {
    const out = printed(() =>
      renderChangesList(null, {
        changes: [change({ held: true })],
        groups: [],
      } as never)
    )
    assert.ok(out.includes('held'))
    assert.ok(!out.includes('claimable at'))
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

describe('changes show, held', () => {
  test('says when the item becomes claimable', () => {
    const at = new Date(Date.now() + 20 * 60_000)
    const out = printed(() =>
      renderChangesShow(null, {
        change: change({ status: 'ready', heldUntil: at.toISOString() }),
        thread: [],
        stageUrl: null,
      } as never)
    )
    assert.ok(out.includes(`(claimable at ${clockTime(at)})`))
  })
})

describe('changes reply', () => {
  test('says the status is untouched, and neutralizes the echo', () => {
    const out = printed(() =>
      renderChangesReply(null, {
        message: {
          body: HOSTILE,
          attachments: [{ kind: 'evidence', label: HOSTILE }],
        },
      } as never)
    )
    assert.ok(out.includes('keeps its status'))
    const answered = printed(() =>
      renderChangesReply(null, {
        message: { body: 'A', authorKind: 'user', attachments: [] },
      } as never)
    )
    assert.ok(answered.includes('back in progress'))
    assert.ok(!out.includes('\x1b[2J'))
    assert.ok(out.includes('[evidence]'))
  })

  const board = (changes: unknown[], groups: unknown[] = []) =>
    printed(() => renderChangesList(undefined, { changes, groups } as any))

  test('lists the columns left to right with counts, empty ones included', () => {
    const out = board([
      change({ shortId: '1', title: 'A', status: 'needs_answer' }),
      change({ shortId: '2', title: 'B', status: 'in_progress' }),
      change({ shortId: '3', title: 'C', status: 'backlog' }),
      change({ shortId: '4', title: 'D' }),
      change({ shortId: '5', title: 'E' }),
    ])
    const order = ['backlog (1)', 'ready (2)', 'in progress (1)', 'needs answer (1)']
    const at = order.map((heading) => out.indexOf(heading))
    assert.ok(at.every((i) => i >= 0), out)
    assert.deepStrictEqual([...at].sort((a, b) => a - b), at)
    assert.match(out, /backlog \(1\)\n  #3  C/)
    assert.doesNotMatch(out, /\bdone \(/)
    assert.match(board([change({ status: 'ready' })]), /backlog \(0\)/)
  })

  test('done shows as a column only when done changes are listed', () => {
    const out = board([change({ status: 'done', title: 'Old' })])
    assert.match(out, /done \(1\)\n  #12  Old/)
  })

  test('badges a live claim and an abandoned in-progress change', () => {
    const live = {
      groupId: 'g1',
      title: 'G',
      claimedBy: 'claude-code',
      claimExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    }
    const lapsed = {
      groupId: 'g2',
      title: 'H',
      claimedBy: 'old',
      claimExpiresAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    }
    const out = board(
      [
        change({ shortId: '1', status: 'in_progress', groupId: 'g1' }),
        change({ shortId: '2', status: 'in_progress', groupId: 'g2' }),
        change({ shortId: '3', status: 'in_progress', groupId: null }),
        change({ shortId: '4', status: 'ready', groupId: 'g1' }),
      ],
      [live, lapsed]
    )
    assert.strictEqual(out.match(/claimed by claude-code until/g)?.length, 2)
    assert.strictEqual(out.match(/abandoned/g)?.length, 2)
  })

  test('badges what kind of answer a parked change needs', () => {
    const out = board([
      change({
        shortId: '1',
        status: 'needs_answer',
        ask: { kind: 'visual', askedBy: 'a', askedAt: new Date() },
      }),
      change({
        shortId: '2',
        status: 'needs_answer',
        ask: { kind: 'question', askedBy: 'a', askedAt: new Date() },
      }),
    ])
    assert.match(out, /needs answer · visual/)
    assert.match(out, /needs answer · question/)
  })
})
