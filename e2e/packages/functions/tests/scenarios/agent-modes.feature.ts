/**
 * Delegate versus supervise, seen from the client.
 *
 * The two modes differ in whose voice reaches the user. In **delegate** mode the
 * sub-agent streams straight to the client and the parent's own text after the
 * hand-off is suppressed. In **supervise** mode the sub-agent reports back to the
 * parent instead, and only the parent's summary is streamed — which is why the
 * supervisor's reply carries its own prefix *and* the sub-agent's findings.
 *
 * The `agent-delegation` suite covers this deterministically at the protocol
 * level. What is left here needs a REAL model, because supervise mode's whole
 * claim is that the parent genuinely summarised what the sub-agent returned —
 * a scripted reply would be the mock asserting against itself. Tagged `ai-live`.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const ROUTER_AGENT = 'routerAgent'
const SUPERVISOR_AGENT = 'supervisorAgent'

export const delegateModeParentAnswersDirectlyScenario = pikkuScenario<
  void,
  { delegated: false }
>({
  title:
    'Delegate mode: the parent answers directly when nothing needs handing off',
  description:
    'A request that needs no sub-agent is answered by the parent itself',
  tags: ['scenario', 'agent-modes', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks what it can do',
      'sendsAgentMessage',
      { message: 'Hello, what can you help me with?' },
      { actor: actors.admin }
    )
    // The parent describes what it can route to rather than routing anything,
    // so naming a domain it covers is how "it answered for itself" is visible.
    await scenario.then(
      'sees the parent describe what it covers',
      'seesInChat',
      { text: 'todo' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees no empty assistant messages',
      'expectsNoEmptyAssistantBlocks',
      undefined,
      { actor: actors.admin }
    )

    return { delegated: false }
  },
})

export const delegateModeSubAgentTextReachesClientScenario = pikkuScenario<
  void,
  { delegated: true }
>({
  title: "Delegate mode: the sub-agent's own words reach the client",
  description:
    'The delegated agent streams straight to the user rather than through the parent',
  tags: ['scenario', 'agent-modes', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the router playground',
      'opensAgentPlayground',
      { agent: ROUTER_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for the todo list',
      'sendsAgentMessage',
      { message: 'List my todos' },
      { actor: actors.admin }
    )
    await scenario.then(
      "sees the sub-agent's own findings",
      'seesInChat',
      { text: 'Review pull requests' },
      { actor: actors.admin }
    )

    return { delegated: true }
  },
})

/**
 * The prefix and the findings together are the assertion.
 *
 * Either alone would pass on the wrong thing: the prefix alone would pass on a
 * supervisor that summarised nothing, and the findings alone would pass on
 * delegate mode, where the sub-agent streamed them directly.
 */
export const superviseModeParentSummarisesScenario = pikkuScenario<
  void,
  { supervised: true }
>({
  title: 'Supervise mode: the parent summarises what the sub-agent returned',
  description:
    "The parent's own voice reaches the user, carrying the sub-agent's findings",
  tags: ['scenario', 'agent-modes', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the supervisor playground',
      'opensAgentPlayground',
      { agent: SUPERVISOR_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for the todo list',
      'sendsAgentMessage',
      { message: 'List my todos' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reply come in the supervisor’s voice',
      'seesInChat',
      { text: 'SUPERVISOR:', caseSensitive: true },
      { actor: actors.admin }
    )
    await scenario.then(
      "sees it carry the sub-agent's findings",
      'seesInChat',
      { text: 'Review pull requests' },
      { actor: actors.admin }
    )

    return { supervised: true }
  },
})

export const agentModesFeature = pikkuFeature({
  name: 'Agent Delegation Modes',
  description: 'Delegate streams the sub-agent; supervise streams the parent',
  tags: ['agent-modes', 'console', 'ai-live'],
  scenarios: [
    delegateModeParentAnswersDirectlyScenario,
    delegateModeSubAgentTextReachesClientScenario,
    superviseModeParentSummarisesScenario,
  ],
})
