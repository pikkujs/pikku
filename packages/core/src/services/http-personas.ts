import type {
  ScenarioPersona,
  ResolvedPersona,
  ScenarioPersonas,
  ScenarioInvokeOptions,
  ScenarioHttpResponse,
} from './personas-service.js'
import { readScenarioHttpResponse } from './personas-service.js'
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

export interface HttpPersonasConfig {
  /**
   * Base API URL of the target app, INCLUDING the HTTP prefix — e.g.
   * `https://app.example.com/api` or `http://localhost:4000/api`. Sign-in is
   * reached at `${apiUrl}${signInPath}` and exposed RPCs at
   * `${apiUrl}${rpcPath}/:rpcName`.
   */
  apiUrl: string
  /**
   * The impersonation secret. Sign-in only ever works for user rows flagged
   * `actor: true` — knowing the secret never impersonates real users.
   */
  secret: string
  /** Persona id → the declaration with its address filled in. */
  personas: Record<string, ResolvedPersona>
  /** Sign-in path under apiUrl. Default: the actor plugin's `/auth/sign-in/actor`. */
  signInPath?: string
  /** Where the session (and its roles) is read back. Default `/auth/get-session`. */
  sessionPath?: string
  /** Exposed-RPC path prefix under apiUrl. Default `/rpc`. */
  rpcPath?: string
  /**
   * Default model a persona thinks with when `converse(...)` is called without
   * an explicit `model`. Its own turns/approvals/evaluation run in-process via
   * the configured `aiAgentRunner`.
   */
  model?: string
}

/**
 * Default HTTP-backed persona. Signs in lazily on first invoke via the Better
 * Auth actor plugin (`POST /auth/sign-in/actor` with `{ email, secret }` —
 * the plugin upserts the actor-flagged user row and mints a session whose
 * `actor` flag flows into audits/analytics). Holds the session cookies for
 * its lifetime; a 401 mid-run re-logs-in once (long health-check runs can
 * outlive a session).
 */
export class HttpPersona implements ScenarioPersona {
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
    private persona: ResolvedPersona,
    private config: HttpPersonasConfig
  ) {
    this.jar = createCookieJar(config.apiUrl)
  }

  get email(): string {
    return this.persona.email
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
        `[scenario] persona '${this.name}' converse needs a model — pass options.model or set 'model' on the personas service`
      )
    }
    const threadId = globalThis.crypto.randomUUID()
    const resourceId = `persona:${this.name}`

    return runConversation({
      persona: this.persona,
      personaId: this.name,
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

  /**
   * The roles the stage says this session holds.
   *
   * Read from better-auth's `get-session`, which is what most pikku apps are
   * running and where its admin plugin puts `role` — on the user, as a
   * comma-separated list. A target that answers something else returns `null`
   * rather than an empty list, because "this stage does not report roles" and
   * "this person has none" call for opposite responses from the caller.
   */
  async sessionRoles(): Promise<string[] | null> {
    if (!this.signedIn) {
      await this.login()
    }
    const sessionPath = this.config.sessionPath ?? '/auth/get-session'
    const res = await this.jar.fetch(`${this.config.apiUrl}${sessionPath}`)
    if (!res.ok) {
      return null
    }
    const text = await res.text().catch(() => '')
    if (!text) {
      return null
    }
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return null
    }
    const user = (payload as { user?: { role?: unknown } } | null)?.user
    const role = user?.role
    if (typeof role === 'string') {
      return role
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    }
    if (Array.isArray(role)) {
      return role.filter((name): name is string => typeof name === 'string')
    }
    // The session came back and carried a user, but no role field — that is a
    // stage reporting "none", not a stage that cannot report.
    return user ? [] : null
  }

  /** Start/continue the target agent's run over HTTP as this persona. */
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

  // knowledge: decisions/internals/scenario-agent-calls-sign-in-on-401-only.md
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
        email: this.persona.email,
        name: this.persona.name,
        secret: this.config.secret,
      }),
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      throw new Error(
        `[scenario] persona sign-in failed for '${this.name}' (${res.status}): ${body}`
      )
    }
    // What proves a session was established is this response setting a cookie,
    // not the jar being non-empty — the target may have set one earlier.
    if (res.headers.getSetCookie().length === 0) {
      throw new Error(
        `[scenario] persona sign-in for '${this.name}' returned no session cookie`
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
 * Build the injected `personas` service from the declared personas: id → lazy
 * HTTP persona. Wire the result as the `personas` singleton service.
 */
export function createHttpPersonas(
  config: HttpPersonasConfig
): ScenarioPersonas {
  const personas: ScenarioPersonas = {}
  for (const [id, persona] of Object.entries(config.personas)) {
    personas[id] = new HttpPersona(id, persona, config)
  }
  return personas
}
