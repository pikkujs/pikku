import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createHttpScenarioActors } from './http-scenario-actors.js'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import type { AIAgentStepResult } from './ai-agent-runner-service.js'

/**
 * Minimal target app exposing the agent HTTP surface: actor sign-in, the agent
 * run route (suspends once for approval, then completes), and the batch approve
 * route (records the decisions). `authRequired` toggles whether the agent
 * routes reject unauthenticated calls with 401 (to exercise lazy sign-in).
 */
const startAgentTarget = async () => {
  let agentRuns = 0
  let logins = 0
  let authRequired = false
  let approvalsSeen: unknown[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      const json = (obj: unknown) =>
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(obj))

      if (req.url === '/api/auth/sign-in/actor') {
        logins++
        res.setHeader('set-cookie', ['session=s1; Path=/; HttpOnly'])
        json({ ok: true })
        return
      }

      const isAgentRoute = req.url?.startsWith('/api/rpc/agent/')
      if (
        isAgentRoute &&
        authRequired &&
        !(req.headers.cookie ?? '').includes('session=')
      ) {
        res.writeHead(401).end()
        return
      }

      if (req.url === '/api/rpc/agent/todoBot/approve') {
        approvalsSeen.push(body.approvals)
        json({ runId: body.runId, text: 'Created it.', status: 'completed' })
        return
      }
      if (req.url === '/api/rpc/agent/todoBot') {
        agentRuns++
        if (agentRuns === 1) {
          json({
            runId: 'run-1',
            text: 'Let me do that.',
            status: 'suspended',
            pendingApprovals: [
              {
                toolCallId: 'tc1',
                toolName: 'createTodo',
                args: { title: 'x' },
              },
            ],
          })
          return
        }
        json({
          runId: `run-${agentRuns}`,
          text: 'All set.',
          status: 'completed',
        })
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  return {
    server,
    apiUrl: `http://127.0.0.1:${port}/api`,
    loginCount: () => logins,
    approvalsSeen: () => approvalsSeen,
    reset: (opts?: { authRequired?: boolean }) => {
      agentRuns = 0
      logins = 0
      approvalsSeen = []
      authRequired = opts?.authRequired ?? false
    },
  }
}

/** Persona LLM scripted by the outputSchema it's asked for. */
const scriptedRunner = () => {
  let turn = 0
  const turns = [
    { message: 'please make a todo', done: false },
    { message: 'thanks', done: true },
  ]
  return {
    run: async (params: {
      outputSchema?: unknown
    }): Promise<AIAgentStepResult> => {
      const props =
        (params.outputSchema as { properties?: Record<string, unknown> })
          ?.properties ?? {}
      const object =
        'message' in props
          ? (turns[turn++] ?? turns[turns.length - 1])
          : 'decisions' in props
            ? { decisions: [{ toolCallId: 'tc1', approved: true }] }
            : { passed: true, reasoning: 'a todo was created' }
      return {
        text: '',
        object,
        toolCalls: [],
        toolResults: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: 'stop',
      }
    },
  }
}

const wireRunner = () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    aiAgentRunner: scriptedRunner(),
  } as any)
}

describe('HttpScenarioActor.converse', async () => {
  const target = await startAgentTarget()
  after(() => {
    target.server.close()
    resetPikkuState()
  })

  test('converses over HTTP, approves in-persona, returns a verdict', async () => {
    wireRunner()
    target.reset()

    const actors = createHttpScenarioActors({
      apiUrl: target.apiUrl,
      secret: 'impersonation-secret',
      model: 'test/test-model',
      actors: {
        pm: { email: 'pm@actors.local', name: 'Priya', personality: 'concise' },
      },
    })

    const verdict = await actors.pm!.converse({
      agent: 'todoBot',
      task: 'Get a todo created for the launch',
      evaluate: 'A todo about the launch now exists',
    })

    assert.equal(verdict.passed, true)
    assert.match(verdict.reasoning, /todo/i)
    // The target's approval was answered in-persona (approved) over HTTP.
    assert.deepEqual(target.approvalsSeen(), [
      [{ toolCallId: 'tc1', approved: true }],
    ])
    // No-auth agent → converse never signs in (lazy login).
    assert.equal(target.loginCount(), 0)
  })

  test('signs in lazily and retries once when an agent route returns 401', async () => {
    wireRunner()
    target.reset({ authRequired: true })

    const actors = createHttpScenarioActors({
      apiUrl: target.apiUrl,
      secret: 'impersonation-secret',
      model: 'test/test-model',
      actors: { pm: { email: 'pm@actors.local' } },
    })

    const verdict = await actors.pm!.converse({
      agent: 'todoBot',
      task: 'make a todo',
      evaluate: 'a todo exists',
    })

    assert.equal(verdict.passed, true)
    // 401 on the first (unauthenticated) call → one sign-in, then cached.
    assert.equal(target.loginCount(), 1)
  })

  test('throws when no AI provider is configured', async () => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    } as any)

    const actors = createHttpScenarioActors({
      apiUrl: target.apiUrl,
      secret: 'impersonation-secret',
      model: 'test/test-model',
      actors: { pm: { email: 'pm@actors.local' } },
    })

    await assert.rejects(
      actors.pm!.converse({ agent: 'todoBot', task: 't', evaluate: 'e' })
    )
  })
})
