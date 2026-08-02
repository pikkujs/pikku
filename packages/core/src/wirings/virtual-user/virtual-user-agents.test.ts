import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { reachableAgents } from './virtual-user-agents.js'

const AGENTS = {
  'router-agent': {
    name: 'router-agent',
    description: 'Routes requests to the right domain agent',
  },
  'social-poster': {
    name: 'social-poster',
    description: 'Drafts and schedules posts',
    scopes: ['content:write'],
  },
  'refund-agent': {
    name: 'refund-agent',
    scopes: ['billing:write'],
  },
}

describe('reachableAgents', () => {
  test('offers every agent when the persona holds no scopes to filter by', () => {
    assert.deepEqual(
      reachableAgents(AGENTS).map((a) => a.name),
      ['router-agent', 'social-poster', 'refund-agent']
    )
  })

  test('an agent gating itself with scopes is offered only to a persona holding them', () => {
    assert.deepEqual(
      reachableAgents(AGENTS, ['content:write']).map((a) => a.name),
      ['router-agent', 'social-poster']
    )
  })

  // Undeclared is not denied. A function gating itself with no scopes is open
  // to everybody, and an agent has to read the same way — inventing a denial
  // here would hide precisely the surfaces that really are open.
  test('an agent declaring no scopes stays open to everybody', () => {
    assert.deepEqual(
      reachableAgents(AGENTS, []).map((a) => a.name),
      ['router-agent']
    )
  })

  test('carries the description through, which is what the model chooses on', () => {
    const [router] = reachableAgents(AGENTS, ['content:write'])
    assert.equal(router!.description, 'Routes requests to the right domain agent')
  })

  test('omits description rather than passing undefined', () => {
    const refund = reachableAgents(AGENTS, ['billing:write']).find(
      (a) => a.name === 'refund-agent'
    )
    assert.deepEqual(refund, { name: 'refund-agent' })
  })

  test('falls back to the declaration key when an agent has no name', () => {
    assert.deepEqual(reachableAgents({ orphan: {} }), [{ name: 'orphan' }])
  })

  test('a project with no agents offers none', () => {
    assert.deepEqual(reachableAgents({}, ['admin']), [])
  })
})
