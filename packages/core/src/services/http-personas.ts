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
  TargetPendingApproval,
} from '../wirings/actor-flow/actor-flow.types.js'
import { runConversation } from '../wirings/actor-flow/run-conversation.js'
import {
  createCookieJar,
  type ScenarioCookieJar,
} from '../wirings/workflow/scenario-cookie-jar.js'
import {
  ActorSignIn,
  type ActorSecretResolver,
  OperatorSignIn,
  type OperatorSignInOptions,
  type PersonaSignIn,
  authMount,
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
   * The ROOT actor secret, from which each persona's own credential is derived
   * and bound to their address. Sign-in only ever works for user rows flagged
   * `actor: true`, and a derived credential only ever works for the one address
   * it was derived for.
   *
   * Pass an {@link ActorSecretResolver} instead to drive personas whose
   * credentials were minted elsewhere — a caller entitled to one persona then
   * never holds the root.
   *
   * The local-development credential. A deployed stage has none, and passes
   * {@link HttpPersonasConfig.operator} instead.
   */
  secret?: string | ActorSecretResolver
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
  /**
   * Where the session (and its roles) is read back. Defaults to `get-session`
   * under the same auth mount as {@link HttpPersonasConfig.signInPath}, so an
   * app that moved auth under `/api` moves this with it and does not have to
   * say so twice.
   */
  sessionPath?: string
  /** Exposed-RPC path prefix under apiUrl. Default `/rpc`. */
  rpcPath?: string
  /**
   * Exposed RPC that reports the CALLER's own roles, as `{ roles: string[] }`.
   * Default `getMyScopes`. Pass `false` to skip it and read better-auth only.
   *
   * Asked before better-auth's `user.role`, because in an app that authorizes
   * on scopes that column is a projection rather than the model — it exists so
   * better-auth's own admin endpoints have something to read, is written by
   * whatever keeps it in step, and is absent entirely from an app that declares
   * no such field. A persona verified against it is verified against a copy.
   */
  rolesRpc?: string | false
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
        ...config.operator,
        signInPath:
          config.operator.signInPath ??
          (authMount(config.signInPath)
            ? `${authMount(config.signInPath)}/sign-in/fabric`
            : undefined),
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
   * {@link HttpPersonasConfig.rolesRpc} first, then better-auth's
   * `get-session` — where its admin plugin puts `role` on the user, as a
   * comma-separated list. A target that answers neither returns `null` rather
   * than an empty list, because "this stage does not report roles" and "this
   * person has none" call for opposite responses from the caller.
   */
  async sessionRoles(): Promise<string[] | null> {
    if (!this.signedIn) {
      await this.login()
    }
    const fromRpc = await this.rolesFromRpc()
    if (fromRpc) return fromRpc
    return await this.rolesFromSession()
  }

  /**
   * The caller's own roles, from the app's own RPC. `null` for every answer
   * that is not a role list — an app without the RPC 404s here, which is a
   * reason to go on and ask better-auth, not a reason to report "none".
   */
  private async rolesFromRpc(): Promise<string[] | null> {
    const rpcName = this.config.rolesRpc ?? 'getMyScopes'
    if (rpcName === false) return null
    let res: Response
    try {
      res = await this.postRpc(rpcName, {})
    } catch {
      return null
    }
    if (!res.ok) return null
    const { body } = await readScenarioHttpResponse<{
      roles?: unknown
      data?: { roles?: unknown }
    }>(res)
    const roles = body?.roles ?? body?.data?.roles
    if (!Array.isArray(roles)) return null
    return roles.filter((name): name is string => typeof name === 'string')
  }

  private async rolesFromSession(): Promise<string[] | null> {
    const mount = authMount(
      this.config.operator?.signInPath ?? this.config.signInPath
    )
    const sessionPath =
      this.config.sessionPath ?? `${mount ?? '/auth'}/get-session`
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

  /**
   * Start/continue the target agent's run over HTTP as this persona.
   *
   * The SSE route, not the plain one. `POST /rpc/agent/:name` buffers the whole
   * run before it sends a single byte, so a run longer than the client's
   * headers timeout — 300s in undici, which is what Node and Bun both use —
   * fails with `UND_ERR_HEADERS_TIMEOUT` and no way to tell it apart from a
   * stage that is down. An agent that talks for several minutes, which is the
   * normal case for anything conversational, cannot be driven that way at all.
   * The stream sends its first event immediately and the run's length stops
   * mattering.
   */
  private async agentRun(
    agentName: string,
    message: string,
    threadId: string,
    resourceId: string
  ): Promise<TargetAgentReply> {
    const res = await this.sendAgent(`agent/${agentName}/stream`, {
      message,
      threadId,
      resourceId,
    })
    return await collectAgentStream(res)
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
  private async sendAgent(subPath: string, body: unknown): Promise<Response> {
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
    return res
  }

  private async postAgent(subPath: string, body: unknown): Promise<unknown> {
    const res = await this.sendAgent(subPath, body)
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

/**
 * Reduce the agent's SSE run into the same reply shape the plain route returns.
 *
 * `RUN_ERROR` is raised rather than returned: the plain route answers a failed
 * run with a non-2xx, and a scenario that read an error as an empty transcript
 * would score the agent on silence it never produced.
 */
async function collectAgentStream(res: Response): Promise<TargetAgentReply> {
  const body = res.body
  if (!body) {
    throw new Error('[scenario] the agent stream carried no body')
  }
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''
  let text = ''
  let runId = ''
  const pendingApprovals: TargetPendingApproval[] = []

  const consume = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(payload)
    } catch {
      return
    }
    if (typeof event.runId === 'string' && event.runId) runId = event.runId
    if (
      event.type === 'TEXT_MESSAGE_CONTENT' &&
      typeof event.delta === 'string'
    ) {
      text += event.delta
    } else if (event.type === 'approval-request') {
      pendingApprovals.push({
        toolCallId: String(event.toolCallId),
        toolName: String(event.toolName),
        args: event.args,
        reason: typeof event.reason === 'string' ? event.reason : undefined,
      })
    } else if (event.type === 'RUN_ERROR' || event.type === 'error') {
      const message = event.message ?? event.errorText ?? 'the agent run failed'
      throw new Error(`[scenario] agent run failed: ${String(message)}`)
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) consume(line)
    }
    if (buffer) consume(buffer)
  } finally {
    await reader.cancel().catch(() => {})
  }

  return {
    text,
    runId,
    status: pendingApprovals.length > 0 ? 'suspended' : 'completed',
    pendingApprovals:
      pendingApprovals.length > 0 ? pendingApprovals : undefined,
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
