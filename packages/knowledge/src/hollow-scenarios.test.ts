import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyScenario, scenarioDepths } from './hollow-scenarios.js'

type Node = {
  rpcName: string
  scenarioStepPhase?: string
  input?: Record<string, unknown>
  next?: string
}

/** Build a linear scenario meta the way codegen writes one: nodes chained by `next`. */
const scenario = (name: string, steps: Node[]) => {
  const nodes: Record<string, Node> = {}
  steps.forEach((step, index) => {
    nodes[`n${index}`] = {
      ...step,
      ...(steps[index + 1] ? { next: `n${index + 1}` } : {}),
    }
  })
  return {
    name,
    source: 'scenario',
    nodes,
    entryNodeIds: steps.length ? ['n0'] : [],
  }
}

const opens = (path: string): Node => ({
  rpcName: 'opensPage',
  scenarioStepPhase: 'when',
  input: { path },
})
const restsOn = (path: string): Node => ({
  rpcName: 'restsOnPath',
  scenarioStepPhase: 'then',
  input: { path },
})
const sees = (text: string): Node => ({
  rpcName: 'seesText',
  scenarioStepPhase: 'then',
  input: { text },
})

// The measured case: this passed 5/5 having proved only that the router left the browser
// on the page the scenario itself opened.
test('opens a page then asserts it is on that page → reachability-only', () => {
  assert.equal(
    classifyScenario(
      scenario('renWritesHowTheDayFelt', [opens('/app'), restsOn('/app')])
    ),
    'reachability-only'
  )
})

// The trailing-slash form is the same route — the step compares them that way, so the
// classifier must too, or the shape escapes by typing `/app/`.
test('the same route with a trailing slash is still reachability-only', () => {
  assert.equal(
    classifyScenario(scenario('slash', [opens('/app'), restsOn('/app/')])),
    'reachability-only'
  )
})

// The case restsOnPath was written for: `/app` bounces to `/app/login` when the session
// cookie does not carry. Different path → a fact the scenario could not have assumed.
test('a redirect assertion is a real assertion', () => {
  assert.equal(
    classifyScenario(scenario('guard', [opens('/app'), restsOn('/app/login')])),
    'asserts'
  )
})

test('any content assertion is a real assertion', () => {
  assert.equal(
    classifyScenario(
      scenario('journal', [
        opens('/app'),
        restsOn('/app'),
        sees('How the day felt'),
      ])
    ),
    'asserts'
  )
})

// Reachability is about what it DID, not only what it checked: a scenario that submits a
// form and then confirms it stayed put has driven real work.
test('a non-navigation action makes it a real assertion even with a restating check', () => {
  const submits: Node = {
    rpcName: 'submitsEntry',
    scenarioStepPhase: 'when',
    input: {},
  }
  assert.equal(
    classifyScenario(
      scenario('writes', [opens('/app'), submits, restsOn('/app')])
    ),
    'asserts'
  )
})

test('acts and asserts nothing at all', () => {
  assert.equal(
    classifyScenario(scenario('silent', [opens('/app')])),
    'no-assertion'
  )
})

// A pure `given` ladder (a fixture) has nothing to prove and must not be judged.
test('a scenario that never acts is not judged', () => {
  const given: Node = {
    rpcName: 'signsIn',
    scenarioStepPhase: 'given',
    input: {},
  }
  assert.equal(classifyScenario(scenario('fixture', [given])), 'not-judged')
})

// Backend scenarios reach their assertions through a different vocabulary; the
// reachability shape is browser-specific and must not touch them.
test('a backend assertion step is a real assertion', () => {
  const call: Node = {
    rpcName: 'callsOrchestratorRpc',
    scenarioStepPhase: 'when',
    input: {},
  }
  const expects: Node = {
    rpcName: 'expectsOrchestratorResponse',
    scenarioStepPhase: 'then',
    input: { outcome: 'succeeds' },
  }
  assert.equal(
    classifyScenario(scenario('authCheck', [call, expects])),
    'asserts'
  )
})

// Order comes from the `next` chain, not key order: asserting a path opened LATER is not
// restating anything the scenario could have known.
test('a rest assertion before the page is opened is a real assertion', () => {
  assert.equal(
    classifyScenario({
      name: 'outOfOrder',
      source: 'scenario',
      entryNodeIds: ['a'],
      nodes: { a: { ...restsOn('/app'), next: 'b' }, b: opens('/app') },
    }),
    'asserts'
  )
})

test('non-scenario meta (a workflow) is never judged', () => {
  assert.equal(
    classifyScenario({
      ...scenario('wf', [opens('/app')]),
      source: 'workflow',
    }),
    'not-judged'
  )
})

test('reads every scenario in the generated meta dir, skipping the verbose twin', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'depths-'))
  const dir = join(cwd, '.pikku/scenarios/meta')
  mkdirSync(dir, { recursive: true })
  const shallow = scenario('shallowOne', [opens('/app'), restsOn('/app')])
  writeFileSync(join(dir, 'shallowOne.gen.json'), JSON.stringify(shallow))
  writeFileSync(
    join(dir, 'shallowOne-verbose.gen.json'),
    JSON.stringify(shallow)
  )
  writeFileSync(
    join(dir, 'realOne.gen.json'),
    JSON.stringify(scenario('realOne', [opens('/app'), sees('Today')]))
  )

  const depths = scenarioDepths(cwd)
  assert.equal(depths.size, 2)
  assert.equal(depths.get('shallowOne'), 'reachability-only')
  assert.equal(depths.get('realOne'), 'asserts')
})

// Every gate that reads codegen output fails open: no meta means codegen has not run,
// which is not evidence that the app proves nothing.
test('missing meta reports nothing rather than blocking', () => {
  assert.equal(scenarioDepths(mkdtempSync(join(tmpdir(), 'empty-'))).size, 0)
})
