import type {
  ScenarioActor,
  ScenarioActorConfig,
  ScenarioActors,
  ScenarioInvokeOptions,
  ScenarioHttpResponse,
} from './scenario-actors-service.js'
import { readScenarioHttpResponse } from './scenario-actors-service.js'
import type {
  ConverseOptions,
  ActorFlowVerdict,
  TargetAgentReply,
} from '../wirings/actor-flow/actor-flow.types.js'
import { runConversation } from '../wirings/actor-flow/run-conversation.js'
import {
  createCookieJar,
  type ScenarioCookieJar,
} from '../wirings/workflow/scenario-cookie-jar.js'
import { getSingletonServices } from '../pikku-state.js'
import { AIProviderNotConfiguredError } from '../errors/errors.js'

export interface HttpScenarioActorsConfig {
  /**
   * Base API URL of the target app, INCLUDING the HTTP prefix — e.g.
   * `https://app.example.com/api` or `http://localhost:4000/api`. Actor
   * sign-in is reached at `${apiUrl}${signInPath}` and exposed RPCs at
   * `${apiUrl}${rpcPath}/:rpcName`.
   */
  apiUrl: string
  /**
   * The actor impersonation secret. Sign-in only ever works for user rows
   * flagged `actor: true` — knowing the secret never impersonates real users.
   */
  secret: string
  /** Actor name → config (usually from pikku.config.json's actor registry). */
  actors: Record<string, ScenarioActorConfig>
  /** Sign-in path under apiUrl. Default: the actor plugin's `/auth/sign-in/actor`. */
  signInPath?: string
  /** Exposed-RPC path prefix under apiUrl. Default `/rpc`. */
  rpcPath?: string
  /**
   * Default model the persona uses when `actor.converse(...)` is called without
   * an explicit `model`. The persona's own turns/approvals/evaluation run
   * in-process via the configured `aiAgentRunner`.
   */
  model?: string
}

/**
 * Default HTTP-backed actor. Signs in lazily on first invoke via the Better
 * Auth actor plugin (`POST /auth/sign-in/actor` with `{ email, secret }` —
 * the plugin upserts the actor-flagged user row and mints a session whose
 * `actor` flag flows into audits/analytics). Holds the session cookies for
 * its lifetime; a 401 mid-run re-logs-in once (long health-check runs can
 * outlive a session).
 */
export class HttpScenarioActor implements ScenarioActor {
  private jar: ScenarioCookieJar
  /**
   * Whether `login()` has succeeded since the last time the session was
   * dropped. The jar cannot answer this — a target may set a cookie before
   * anyone signs in, and it would then look like a session that was never
   * established.
   */
  private signedIn = false

  constructor(
    readonly name: string,
    private actorConfig: ScenarioActorConfig,
    private config: HttpScenarioActorsConfig
  ) {
    this.jar = createCookieJar(config.apiUrl)
  }

  get email(): string {
    return this.actorConfig.email
  }

  async invoke(rpcName: string, data: unknown): Promise<unknown> {
    const res = await this.invokeRaw(rpcName, data)
    if (!res.ok) {
      throw new Error(
        `[scenario] '${rpcName}' as '${this.name}' returned ${res.status}: ${res.serialized.slice(0, 300)}`
      )
    }
    return res.body
  }

  async invokeRaw(
    rpcName: string,
    data: unknown,
    options?: ScenarioInvokeOptions
  ): Promise<ScenarioHttpResponse> {
    if (!this.signedIn) {
      await this.login()
    }
    let res = await this.postRpc(rpcName, data, options?.headers)
    if (res.status === 401) {
      // Session expired mid-run — re-login once and retry.
      this.signOut()
      await this.login()
      res = await this.postRpc(rpcName, data, options?.headers)
    }
    return readScenarioHttpResponse(res)
  }

  async converse(options: ConverseOptions): Promise<ActorFlowVerdict> {
    const { aiAgentRunner } = getSingletonServices()
    if (!aiAgentRunner) {
      throw new AIProviderNotConfiguredError()
    }
    const model = options.model ?? this.config.model
    if (!model) {
      throw new Error(
        `[scenario] actor '${this.name}' converse needs a model — pass options.model or set 'model' on the actors service`
      )
    }
    const threadId = globalThis.crypto.randomUUID()
    const resourceId = `actor:${this.name}`

    return runConversation({
      actor: this.actorConfig,
      actorName: this.actorConfig.name ?? this.name,
      agentName: options.agent,
      task: options.task,
      evaluate: options.evaluate,
      approvals: options.approvals,
      model,
      maxTurns: options.maxTurns,
      llm: (params) => aiAgentRunner.run(params),
      target: {
        run: (message) =>
          this.agentRun(options.agent, message, threadId, resourceId),
        approve: (runId, decisions) =>
          this.agentApprove(options.agent, runId, decisions),
      },
    })
  }

  /** Start/continue the target agent's run over HTTP as this actor. */
  private async agentRun(
    agentName: string,
    message: string,
    threadId: string,
    resourceId: string
  ): Promise<TargetAgentReply> {
    const raw = await this.postAgent(`agent/${agentName}`, {
      message,
      threadId,
      resourceId,
    })
    return normalizeAgentReply(raw)
  }

  /** Answer the target agent's pending approvals over HTTP and continue. */
  private async agentApprove(
    agentName: string,
    runId: string,
    decisions: { toolCallId: string; approved: boolean }[]
  ): Promise<TargetAgentReply> {
    const raw = await this.postAgent(`agent/${agentName}/approve`, {
      runId,
      approvals: decisions,
    })
    return normalizeAgentReply(raw)
  }

  /**
   * POST an agent HTTP route (raw body, not RPC-wrapped). Signs in lazily: the
   * first call goes out with whatever cookie we hold (none, for a no-auth
   * agent), and only a 401 triggers `login()` + one retry. This lets an actor
   * converse with a no-auth agent without any sign-in wiring, while still
   * authenticating against agents that require a session.
   */
  private async postAgent(subPath: string, body: unknown): Promise<unknown> {
    const rpcPath = this.config.rpcPath ?? '/rpc'
    const url = `${this.config.apiUrl}${rpcPath}/${subPath}`
    const send = () =>
      this.jar.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    let res = await send()
    if (res.status === 401) {
      this.signOut()
      await this.login()
      res = await send()
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(
        `[scenario] agent call '${subPath}' as '${this.name}' returned ${res.status}: ${text}`
      )
    }
    if (res.status === 204) return undefined
    const text = await res.text()
    return text ? JSON.parse(text) : undefined
  }

  private async postRpc(
    rpcName: string,
    data: unknown,
    extraHeaders?: Record<string, string>
  ) {
    const rpcPath = this.config.rpcPath ?? '/rpc'
    return this.jar.fetch(`${this.config.apiUrl}${rpcPath}/${rpcName}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ data }),
    })
  }

  /** Drop the session, so the next call signs in again before it goes out. */
  private signOut(): void {
    this.jar.clear()
    this.signedIn = false
  }

  private async login(): Promise<void> {
    const signInPath = this.config.signInPath ?? '/auth/sign-in/actor'
    const res = await this.jar.fetch(`${this.config.apiUrl}${signInPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: this.actorConfig.email,
        name: this.actorConfig.name ?? this.name,
        secret: this.config.secret,
      }),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(
        `[scenario] actor sign-in failed for '${this.name}' (${res.status}): ${body}`
      )
    }
    // What proves a session was established is this response setting a cookie,
    // not the jar being non-empty — the target may have set one earlier.
    if (res.headers.getSetCookie().length === 0) {
      throw new Error(
        `[scenario] actor sign-in for '${this.name}' returned no session cookie`
      )
    }
    this.signedIn = true
  }
}

/** Normalize an agentRun/agentApprove HTTP response into a TargetAgentReply. */
function normalizeAgentReply(raw: unknown): TargetAgentReply {
  const r = (raw ?? {}) as Record<string, unknown>
  const pending = Array.isArray(r.pendingApprovals)
    ? (r.pendingApprovals as Array<Record<string, unknown>>).map((p) => ({
        toolCallId: String(p.toolCallId),
        toolName: String(p.toolName),
        args: p.args,
        reason: typeof p.reason === 'string' ? p.reason : undefined,
      }))
    : undefined
  return {
    text: typeof r.text === 'string' ? r.text : '',
    runId: typeof r.runId === 'string' ? r.runId : '',
    status:
      r.status === 'completed' || r.status === 'suspended'
        ? r.status
        : undefined,
    pendingApprovals: pending,
  }
}

/**
 * Build the injected `actors` service from the config registry: actor name →
 * lazy HTTP actor. Wire the result as the `actors` singleton service.
 */
export function createHttpScenarioActors(
  config: HttpScenarioActorsConfig
): ScenarioActors {
  const actors: ScenarioActors = {}
  for (const [name, actorConfig] of Object.entries(config.actors)) {
    actors[name] = new HttpScenarioActor(name, actorConfig, config)
  }
  return actors
}
