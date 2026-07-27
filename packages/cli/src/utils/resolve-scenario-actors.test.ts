import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { resolveScenarioActors } from './resolve-scenario-actors.js'

describe('resolveScenarioActors', () => {
  test('materialises one actor per persona', () => {
    const actors = resolveScenarioActors({
      personas: {
        owner: { description: 'Owns their own entries' },
        orgAdmin: { description: 'Runs the org' },
      },
    })
    assert.deepEqual(actors, {
      owner: { persona: 'owner', email: 'owner@actors.local' },
      orgAdmin: { persona: 'orgAdmin', email: 'org-admin@actors.local' },
    })
  })

  test('a declared actor keeps its own email and claims its persona by name', () => {
    const actors = resolveScenarioActors({
      personas: { owner: { description: 'Owns their own entries' } },
      actors: { owner: { email: 'real@example.com', name: 'Owner' } },
    })
    assert.deepEqual(actors, {
      owner: { email: 'real@example.com', name: 'Owner', persona: 'owner' },
    })
  })

  test('a second body of one persona is kept, and does not suppress the first', () => {
    const actors = resolveScenarioActors({
      personas: { owner: { description: 'Owns their own entries' } },
      actors: { ownerB: { email: 'owner-b@example.com', persona: 'owner' } },
    })
    // ownerB claims the persona, so no `owner` is materialised — the isolation
    // scenario declares BOTH bodies itself when it needs two.
    assert.deepEqual(actors, {
      ownerB: { email: 'owner-b@example.com', persona: 'owner' },
    })
  })

  test('a system persona gets no actor — there is nobody to sign in', () => {
    const actors = resolveScenarioActors({
      personas: {
        owner: { description: 'Owns their own entries' },
        reminders: { description: 'The app sending reminders', kind: 'system' },
      },
    })
    assert.deepEqual(Object.keys(actors), ['owner'])
  })

  test('a system persona may still be given a body by hand', () => {
    const actors = resolveScenarioActors({
      personas: {
        reminders: { description: 'The app sending reminders', kind: 'system' },
      },
      actors: { reminders: { email: 'service@example.com' } },
    })
    assert.deepEqual(actors, {
      reminders: { email: 'service@example.com', persona: 'reminders' },
    })
  })

  test('an actor naming a persona nobody declared is an error', () => {
    assert.throws(
      () =>
        resolveScenarioActors({
          personas: { owner: { description: 'Owns their own entries' } },
          actors: { ghost: { email: 'ghost@example.com', persona: 'nope' } },
        }),
      /names persona 'nope'.*declared: owner/s
    )
  })

  test('two actors sharing an email is an error', () => {
    assert.throws(
      () =>
        resolveScenarioActors({
          actors: {
            one: { email: 'same@example.com' },
            two: { email: 'SAME@example.com' },
          },
        }),
      /share the email/
    )
  })

  test('an existing actor registry with no personas is untouched', () => {
    const actors = resolveScenarioActors({
      actors: { visitor: { email: 'visitor@actors.local', name: 'Visitor' } },
    })
    assert.deepEqual(actors, {
      visitor: { email: 'visitor@actors.local', name: 'Visitor' },
    })
  })

  test('no scenarios config at all resolves to an empty registry', () => {
    assert.deepEqual(resolveScenarioActors(undefined), {})
  })
})
