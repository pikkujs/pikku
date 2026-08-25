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
import {
  ActorSignIn,
  OperatorSignIn,
  type OperatorSignInOptions,
  type PersonaSignIn,
} from './persona-sign-in.js'
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
   *
   * The local-development credential. A deployed stage has none, and passes
   * {@link HttpPersonasConfig.operator} instead.
   */
  secret?: string
  /**
   * Fabric operator credentials, for signing personas into a DEPLOYED stage.
   *
   * Mutually exclusive with {@link HttpPersonasConfig.secret}: the operator
   * path acts as the persona through an admin session rather than logging in as
   * them, so no test credential has to exist on the target at all.
   */
  operator?: OperatorSignInOptions
  /** Persona id → the declaration with its address filled in. */
  personas: Record<string, ResolvedPersona>
  /**
   * Sign-in path under apiUrl, for whichever of the two paths is in use — an
   * app that mounts auth under `/api` moves both. Default: the actor plugin's
   * `/auth/sign-in/actor`, or `/auth/sign-in/fabric` for an operator.
   * {@link OperatorSignInOptions.signInPath} overrides it.
   */
  signInPath?: string
  /** Where the session (and its roles) is read back. Default `/auth/get-session`. */
  sessionPath?: string
  /** Exposed-RPC path prefix under apiUrl. Default `/rpc`. */
  rpcPath?: string
  /**
   * Default model a persona thinks with when `converse(...)` is called without
   * an explicit `model`. Its own turns/approvals/evaluation run in-process via
   * the configured `agentRunner`.
   */
  model?: string
}

/**
 * Default HTTP-backed persona. Signs in lazily on first invoke, holds the
 * session cookies for its lifetime, and re-logs-in once on a 401 mid-run (long
 * health-check runs can outlive a session).
 *
 * How it signs in depends on the target, and the two ways are not
 * interchangeable — see {@link ActorSignIn} for local development and
 * {@link OperatorSignIn} for a deployed stage.
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
  private signIn: PersonaSignIn

  constructor(
    readonly name: string,
    private persona: ResolvedPersona,
    private config: HttpPersonasConfig
  ) {
    this.jar = createCookieJar(config.apiUrl)
    if (config.operator) {
      this.signIn = new OperatorSignIn(config.apiUrl, {
        signInPath: config.signInPath,
        ...config.operator,
      })
    } else if (config.secret) {
      this.signIn = new ActorSignIn(
        config.apiUrl,
        config.secret,
        config.signInPath ?? '/auth/sign-in/actor'
      )
    } else {
      throw new Error(
        `[scenario] persona '${name}' has no way to sign in — set 'secret' for a dev target or 'operator' for a deployed one`
      )
    }
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
    const { agentRunner } = getSingletonServices()
    if (!agentRunner) {
      throw new AIProviderNotConfiguredError()
    }
    // Signed in here rather than left to postAgent's 401 retry, which a public
    // agent route never triggers. An unowned thread is minted under a fresh
    // anonymous id per request, so turn one succeeds and turn two is refused as
    // somebody else's — and a persona is a real account with real credentials,
    // so there is no case where conversing as nobody is the intent.
    if (!this.signedIn) {
      await this.login()
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
      llm: (params) => agentRunner.run(params),
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
    const res = await this.jar.fetch(`${this.config.apiUrl}${sessionPath}`, {
      headers: this.signIn.headers(),
    })
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
        headers: {
          'content-type': 'application/json',
          ...this.signIn.headers(),
        },
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
      headers: {
        'content-type': 'application/json',
        ...this.signIn.headers(),
        ...extraHeaders,
      },
      body: JSON.stringify({ data }),
    })
  }

  /** Drop the session, so the next call signs in again before it goes out. */
  private signOut(): void {
    this.jar.clear()
    this.signedIn = false
  }

  private async login(): Promise<void> {
    await this.signIn.login(this.jar, this.persona)
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
