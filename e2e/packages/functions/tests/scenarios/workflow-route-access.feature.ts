/**
 * Who the generated workflow routes turn away. Each scenario is a real request.
 * The routes themselves are open and check nothing for the workflow: it judges
 * its own declaration when it runs, and a run is read by its owner.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const HIDDEN = 'routeHiddenWorkflow'
const EXPOSED = 'routeExposedWorkflow'
const PUBLIC = 'routePublicWorkflow'
const OWNER = 'route-owner'
const input = { data: { value: 2 } }

export const anonymousStatusRefused = pikkuScenario<void, { refused: true }>({
  title:
    'An anonymous caller cannot read a run of a workflow that wants a session',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${EXPOSED}/start`,
      userId: OWNER,
      body: input,
    })
    const { runId } = JSON.parse(started.serialized)
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/status/${runId}`,
        method: 'GET',
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const anonymousApproveRefused = pikkuScenario<void, { refused: true }>({
  title: 'An anonymous caller cannot answer a gate, even on an open workflow',
  description: 'Answers 401',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${PUBLIC}/start`,
      body: input,
    })
    const { runId } = JSON.parse(started.serialized)
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${PUBLIC}/approve/${runId}`,
        body: { reason: 'gate', decision: {} },
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 401,
    })
    return { refused: true }
  },
})

export const unknownNameHidden = pikkuScenario<void, { refused: true }>({
  title: 'An unknown workflow answers the same as a hidden one',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: '/workflow/noSuchWorkflow/start',
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const hiddenStartRefused = pikkuScenario<void, { refused: true }>({
  title: 'A signed-in caller cannot start a hidden workflow',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${HIDDEN}/start`,
        userId: OWNER,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const hiddenRunRefused = pikkuScenario<void, { refused: true }>({
  title: 'A signed-in caller cannot run a hidden workflow',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${HIDDEN}/run`,
        userId: OWNER,
        body: input,
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const approveRefusesUnknownRun = pikkuScenario<void, { refused: true }>({
  title: 'A signed-in caller cannot answer a run that is not there',
  description: 'Answers 404',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when(
      'calls the route',
      'callsWorkflowRoute',
      {
        path: `/workflow/${EXPOSED}/approve/no-such-run`,
        userId: OWNER,
        body: { reason: 'gate', decision: {} },
      }
    )
    await scenario.then('expects the status', 'expectsRouteStatus', {
      call: answer,
      status: 404,
    })
    return { refused: true }
  },
})

export const ownerAloneReadsARun = pikkuScenario<void, { read: true }>({
  title: 'Only the user who started a run can read it',
  description: 'The owner reads it, another user gets a 403',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${EXPOSED}/start`,
      userId: OWNER,
      body: input,
    })
    const { runId } = JSON.parse(started.serialized)
    const path = `/workflow/${EXPOSED}/status/${runId}`
    const stranger = await scenario.when(
      'a stranger reads',
      'callsWorkflowRoute',
      {
        path,
        method: 'GET',
        userId: 'someone-else',
      }
    )
    await scenario.then('expects a refusal', 'expectsRouteStatus', {
      call: stranger,
      status: 403,
    })
    const owner = await scenario.when('the owner reads', 'callsWorkflowRoute', {
      path,
      method: 'GET',
      userId: OWNER,
    })
    await scenario.then('expects an answer', 'expectsRouteStatus', {
      call: owner,
      status: 200,
    })
    return { read: true }
  },
})

export const signedInRunFinishes = pikkuScenario<void, { finished: true }>({
  title: 'A signed-in caller runs a workflow that wants a session to the end',
  description: 'The body and its steps run as the caller',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const answer = await scenario.when('runs', 'callsWorkflowRoute', {
      path: `/workflow/${EXPOSED}/run`,
      userId: OWNER,
      body: input,
    })
    await scenario.then('expects an answer', 'expectsRouteStatus', {
      call: answer,
      status: 200,
    })
    return { finished: true }
  },
})

export const openWorkflowIsOpen = pikkuScenario<void, { read: true }>({
  title:
    'An auth: false workflow starts and reads anonymously on the same routes',
  description: 'One route per action: the declaration decides',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when('starts', 'callsWorkflowRoute', {
      path: `/workflow/${PUBLIC}/start`,
      body: input,
    })
    await scenario.then('expects it to start', 'expectsRouteStatus', {
      call: started,
      status: 200,
    })
    const { runId } = JSON.parse(started.serialized)
    const read = await scenario.when('someone reads', 'callsWorkflowRoute', {
      path: `/workflow/${PUBLIC}/status/${runId}`,
      method: 'GET',
    })
    await scenario.then('expects an answer', 'expectsRouteStatus', {
      call: read,
      status: 200,
    })
    return { read: true }
  },
})

export const workflowRouteAccessFeature = pikkuFeature({
  name: 'Workflow route access',
  description: 'Who the generated workflow routes refuse',
  tags: ['workflow'],
  scenarios: [
    anonymousStatusRefused,
    anonymousApproveRefused,
    unknownNameHidden,
    hiddenStartRefused,
    hiddenRunRefused,
    approveRefusesUnknownRun,
    ownerAloneReadsARun,
    signedInRunFinishes,
    openWorkflowIsOpen,
  ],
})
