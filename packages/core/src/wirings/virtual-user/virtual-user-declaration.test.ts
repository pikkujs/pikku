import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { virtualUserEmail, virtualUserEmails } from './virtual-user-email.js'
import {
  isRunnableVirtualUser,
  roleMismatchMessage,
  verifyVirtualUserRoles,
} from './validate-virtual-users.js'
import {
  allowedLinks,
  applyMailboxAllowlist,
  isAllowedSender,
} from './virtual-user-mailbox.js'
import type { ReceivedEmail } from './virtual-user-mailbox.js'

describe('computed addresses', () => {
  test('a run gets its own sub-address', () => {
    assert.equal(
      virtualUserEmail('susan', 'mail.example.com', 'r7'),
      'susan+r7@mail.example.com'
    )
  })

  test('without a run id the address is the stable, seedable form', () => {
    assert.equal(
      virtualUserEmail('susan', 'mail.example.com'),
      'susan@mail.example.com'
    )
  })

  test('an id that is not address-shaped is reduced to one', () => {
    assert.equal(
      virtualUserEmail('Susan.Buyer_2', 'example.com'),
      'susan-buyer-2@example.com'
    )
  })

  test('an id with nothing usable in it is refused rather than guessed at', () => {
    assert.throws(
      () => virtualUserEmail('...', 'example.com'),
      /no usable email label/
    )
  })

  // A synthetic domain was rejected precisely because it makes every
  // email-driven flow untestable; something that is not a domain at all should
  // not slip through as one.
  test('a domain that is not a domain is refused', () => {
    assert.throws(() => virtualUserEmail('susan', 'virtualUsers'), /is not a domain/)
    assert.throws(() => virtualUserEmail('susan', 'a@b.com'), /is not a domain/)
  })

  test('a leading @ on the domain is tolerated', () => {
    assert.equal(virtualUserEmail('susan', '@example.com'), 'susan@example.com')
  })
})

describe('addresses across a run', () => {
  test('every virtual user gets one', () => {
    const emails = virtualUserEmails(['susan', 'yasser'], 'example.com', 'r1')
    assert.deepEqual(emails, {
      susan: 'susan+r1@example.com',
      yasser: 'yasser+r1@example.com',
    })
  })

  // Two virtual users sharing an address share a user row and read each other's
  // magic links — the run passes and means nothing.
  test('two ids that reduce to the same label are refused', () => {
    assert.throws(
      () => virtualUserEmails(['susan-buyer', 'Susan.Buyer'], 'example.com'),
      /both compute the address/
    )
  })
})

describe('who can run', () => {
  test('an email login runs', () => {
    assert.equal(isRunnableVirtualUser({ account: {} }), true)
  })

  test('a virtual user with no account block at all still runs', () => {
    assert.equal(isRunnableVirtualUser({}), true)
  })

  // Driving a consent screen needs a human, so this is a property of the
  // account rather than a decision anyone should have to remember to record.
  test('a provider login does not', () => {
    assert.equal(isRunnableVirtualUser({ account: { provider: 'google' } }), false)
  })

  test('an explicit refusal wins over an otherwise runnable account', () => {
    assert.equal(isRunnableVirtualUser({ account: {}, runnable: false }), false)
  })
})

describe('verifying roles at sign-in', () => {
  test('a match runs', () => {
    const v = verifyVirtualUserRoles('susan', ['buyer'], ['buyer'])
    assert.equal(v.ok, true)
    assert.equal(roleMismatchMessage(v), null)
  })

  test('order and duplication are not drift', () => {
    const v = verifyVirtualUserRoles(
      'yasser',
      ['admin', 'buyer'],
      ['buyer', 'admin', 'buyer']
    )
    assert.equal(v.ok, true)
  })

  // Under-granted: the 403s look like authorization findings but are seed drift.
  test('a missing role stops the run and says which', () => {
    const v = verifyVirtualUserRoles('susan', ['buyer'], [])
    assert.equal(v.ok, false)
    assert.deepEqual(v.missing, ['buyer'])
    assert.match(roleMismatchMessage(v)!, /missing buyer/)
  })

  // Over-granted: nothing fails, the virtual user just stops testing its boundary.
  test('an extra role stops the run too', () => {
    const v = verifyVirtualUserRoles('susan', ['buyer'], ['buyer', 'admin'])
    assert.equal(v.ok, false)
    assert.deepEqual(v.extra, ['admin'])
    assert.match(roleMismatchMessage(v)!, /unexpectedly holds admin/)
  })

  test('both directions are reported together', () => {
    const message = roleMismatchMessage(
      verifyVirtualUserRoles('susan', ['buyer'], ['admin'])
    )!
    assert.match(message, /missing buyer and unexpectedly holds admin/)
  })
})

const email = (over: Partial<ReceivedEmail> = {}): ReceivedEmail => ({
  to: 'susan+r1@example.com',
  from: 'noreply@example.com',
  subject: 'Verify',
  receivedAt: new Date(),
  links: [],
  codes: [],
  ...over,
})

describe('the sender allowlist', () => {
  const allowlist = { senders: ['noreply@example.com', 'mail.example.com'] }

  test('an exact sender is allowed', () => {
    assert.equal(isAllowedSender('noreply@example.com', allowlist), true)
  })

  test('a bare domain entry allows any sender at it', () => {
    assert.equal(isAllowedSender('bounces@mail.example.com', allowlist), true)
  })

  test('case does not decide it', () => {
    assert.equal(isAllowedSender('NoReply@Example.COM', allowlist), true)
  })

  // The whole point: an address that is real and deliverable is an address
  // anyone can send instructions to.
  test('a stranger is dropped', () => {
    assert.equal(isAllowedSender('attacker@evil.test', allowlist), false)
  })

  // 'example.com' must not admit 'example.com.attacker.net'.
  test('a domain entry is not a substring match', () => {
    assert.equal(
      isAllowedSender('x@mail.example.com.attacker.net', allowlist),
      false
    )
  })

  test('filtering drops the stranger and keeps the rest', () => {
    const kept = applyMailboxAllowlist(
      [email(), email({ from: 'attacker@evil.test' })],
      allowlist
    )
    assert.equal(kept.length, 1)
    assert.equal(kept[0]!.from, 'noreply@example.com')
  })
})

describe('link origins', () => {
  const allowlist = {
    senders: ['example.com'],
    linkOrigins: ['https://staging.example.com'],
  }

  test('an on-origin link survives', () => {
    assert.deepEqual(
      allowedLinks(['https://staging.example.com/verify?t=1'], allowlist),
      ['https://staging.example.com/verify?t=1']
    )
  })

  test('an off-origin link is dropped', () => {
    assert.deepEqual(allowedLinks(['https://evil.test/steal'], allowlist), [])
  })

  test('garbage is dropped rather than thrown on', () => {
    assert.deepEqual(allowedLinks(['not a url'], allowlist), [])
  })

  // Dropping the link rather than the email: a legitimate stage email may
  // carry an unsubscribe link elsewhere, and refusing it would break the flow
  // this exists to test.
  test('a mixed email keeps its good link and loses the bad one', () => {
    const [kept] = applyMailboxAllowlist(
      [
        email({
          from: 'noreply@example.com',
          links: ['https://staging.example.com/verify', 'https://evil.test/x'],
        }),
      ],
      allowlist
    )
    assert.deepEqual(kept!.links, ['https://staging.example.com/verify'])
  })

  test('no configured origins means no narrowing', () => {
    assert.deepEqual(
      allowedLinks(['https://anywhere.test/x'], { senders: [] }),
      ['https://anywhere.test/x']
    )
  })
})
