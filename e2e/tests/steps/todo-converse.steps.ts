import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { createOpenAI } from '@ai-sdk/openai'
import { VercelAIAgentRunner } from '@pikku/ai-vercel'
import {
  createHttpScenarioActors,
  type ScenarioActors,
} from '@pikku/core/services'
import { pikkuState } from '@pikku/core/internal'
import type { ActorFlowVerdict } from '@pikku/core/actor-flow'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

/**
 * The actor registry mirrors pikku.config.json's `scenarios.actors`. converse
 * drives the target agent over HTTP as this persona; the persona's own turns
 * run in-process via the aiAgentRunner we wire below.
 */
const ACTORS = {
  shopper: {
    email: 'shopper@actors.local',
    name: 'Shopper',
    jobTitle: 'First-time buyer',
    personality: 'Impatient shopper who abandons slow checkouts',
  },
  support: {
    email: 'support@actors.local',
    name: 'Support',
    jobTitle: 'Support agent',
    personality: 'Methodical agent who double-checks every order',
  },
}

/** Build the HTTP actors, wiring an in-process LLM for the persona's own turns. */
const buildActors = (): ScenarioActors => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: {
      info: () => {},
      warn: () => {},
      error: (...a: unknown[]) => console.error('[converse]', ...a),
      debug: () => {},
    },
    aiAgentRunner: new VercelAIAgentRunner({ openai: createOpenAI() }),
  } as any)

  return createHttpScenarioActors({
    apiUrl: config.apiUrl,
    // todo-agent is no-auth, so converse never signs in — the secret is unused.
    secret: process.env.SCENARIO_ACTOR_SECRET ?? 'e2e-unused',
    model: 'openai/gpt-5-mini',
    actors: ACTORS,
  })
}

const todosRpc = async (name: string, data: unknown = {}) => {
  const res = await fetch(`${config.apiUrl}/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    throw new Error(`RPC ${name} failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

Given('the todo list is reset', async function (this: AgentWorld) {
  await todosRpc('todos:resetTodos')
})

When(
  'the {string} actor asks the {string} to add a todo titled {string}',
  async function (
    this: AgentWorld,
    actorName: string,
    agentName: string,
    title: string
  ) {
    const actors = buildActors()
    const actor = actors[actorName]
    if (!actor) {
      throw new Error(`Unknown actor '${actorName}'`)
    }
    const verdict = await actor.converse({
      agent: agentName,
      task: `Ask the assistant to add a single todo titled exactly "${title}". When it asks permission to run a tool, allow it.`,
      evaluate: `A todo titled "${title}" was successfully added.`,
      approvals: 'always',
    })
    ;(this as any).verdict = verdict
  }
)

Then(
  'the actor should conclude the task succeeded',
  function (this: AgentWorld) {
    const verdict = (this as any).verdict as ActorFlowVerdict | undefined
    assert.ok(verdict, 'no verdict was produced')
    assert.equal(
      verdict.passed,
      true,
      `actor judged the task failed: ${verdict.reasoning}\n\nTranscript:\n${verdict.transcript.join('\n')}`
    )
  }
)

Then(
  'the todo list should contain {string}',
  async function (this: AgentWorld, title: string) {
    const { todos } = (await todosRpc('todos:listTodos')) as {
      todos: Array<{ title: string }>
    }
    const titles = todos.map((t) => t.title)
    // The model may add punctuation/casing ("Book the venue."), so match on a
    // normalized substring rather than exact equality.
    const needle = title.toLowerCase()
    assert.ok(
      titles.some((t) => t.toLowerCase().includes(needle)),
      `todo "${title}" not found in the store. Got: ${JSON.stringify(titles)}`
    )
  }
)
