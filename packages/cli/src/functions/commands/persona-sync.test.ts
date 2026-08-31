import assert from 'node:assert/strict'
import { describe, test, beforeEach } from 'node:test'
import { personaSync } from './persona-sync.js'

/**
 * The command reports; the deployment provisions. So what is under test is the
 * environment rule applied to the declaration — who an environment will end up
 * with, and why anyone was left out — and nothing here opens a database,
 * because the command no longer has one to open.
 */
let logs: string[]

const logger = {
  info: (msg: string) => logs.push(msg),
  warn: (msg: string) => logs.push(msg),
  error: (msg: string) => logs.push(msg),
  debug: () => {},
} as any

/**
 * Three people: one who works everywhere, one pinned to production as the only
 * disposition allowed there, and one who exists to be acted upon.
 */
const PERSONAS = [
  {
    id: 'susan',
    name: 'Susan',
    roles: ['report-viewer'],
    goals: [],
    tags: [],
    runnable: true,
  },
  {
    id: 'mo',
    name: 'Mo',
    roles: ['platform-admin'],
    goals: [],
    tags: [],
    disposition: 'accountable',
    environments: ['prod'],
    runnable: true,
  },
  {
    id: 'target',
    name: 'Target',
    roles: [],
    goals: [],
    tags: [],
    runnable: false,
  },
]

const config = {
  scenarios: { emailDomain: 'e2e.test' },
  environments: {
    local: { apiUrl: 'http://persona-sync.invalid' },
    prod: { apiUrl: 'http://persona-sync.invalid', production: true },
  },
}

const run = async (data: any, personas: unknown[] = PERSONAS) =>
  personaSync.func(
    {
      logger,
      config,
      getInspectorState: async () => ({ personas: { definitions: personas } }),
    } as any,
    data,
    {} as any
  )

beforeEach(() => {
  logs = []
})

describe('pikku persona sync', () => {
  test('reports each persona with the roles it declares', async () => {
    await run({ environment: 'local' })

    const output = logs.join('\n')
    assert.match(output, /susan\s+susan@e2e\.test -> report-viewer/)
    assert.match(output, /2 persona\(s\) will be provisioned/)
  })

  // Their account is the whole reason they were declared: other people ban,
  // unban and reset it. Leaving them out would break the scenarios that act
  // on them.
  test('includes a persona that is declared runnable: false', async () => {
    await run({ environment: 'local' })

    assert.match(logs.join('\n'), /target\s+target@e2e\.test/)
  })

  // The rule that decides who may run decides who is provisioned. `mo` names
  // production and nothing else, so `local` is not theirs.
  test('skips a persona that does not act in this environment', async () => {
    await run({ environment: 'local' })

    const output = logs.join('\n')
    assert.ok(!/mo\s+mo@e2e\.test/.test(output))
    assert.match(output, /skipped: Refusing to sign in persona 'mo'/)
  })

  // The other direction: production takes the accountable persona that named
  // it, and nobody else — the two who left `environments` off default to
  // everywhere *but* production.
  test('reports only the accountable persona for production', async () => {
    await run({ environment: 'prod' })

    const output = logs.join('\n')
    assert.match(output, /1 persona\(s\) will be provisioned/)
    assert.match(output, /mo\s+mo@e2e\.test -> platform-admin/)
  })

  test('points at the plugin rather than claiming to have written anything', async () => {
    await run({ environment: 'local' })

    assert.match(logs.join('\n'), /pikkuFabric/)
  })

  test('refuses an environment that is not configured', async () => {
    await assert.rejects(
      () => run({ environment: 'staging' }),
      /Unknown environment 'staging'/
    )
  })

  test('a project with no personas is a no-op, not an error', async () => {
    await run({ environment: 'local' }, [])

    assert.match(logs.join('\n'), /no personas are declared/)
  })

  test('an environment nobody may act in says so, and why', async () => {
    await run({ environment: 'prod' }, [PERSONAS[0]])

    const output = logs.join('\n')
    assert.match(output, /no persona may act in 'prod'/)
    assert.match(output, /Refusing to sign in persona 'susan'/)
  })
})
