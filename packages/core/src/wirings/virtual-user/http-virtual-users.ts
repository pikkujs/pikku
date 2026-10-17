import type {
  ScenarioVirtualUser,
  ResolvedVirtualUser,
  ScenarioVirtualUsers,
  ScenarioInvokeOptions,
  ScenarioHttpResponse,
} from '../../services/virtual-users-service.js'
import { readScenarioHttpResponse } from '../../services/virtual-users-service.js'
import type {
  ConverseOptions,
  ConversationVerdict,
  TargetAgentReply,
  TargetPendingApproval,
} from './conversation/conversation.types.js'
import { runConversation } from './conversation/run-conversation.js'
import {
  createCookieJar,
  type ScenarioCookieJar,
} from '../../services/scenario-cookie-jar.js'
import {
  authMount,
  type VirtualUserSignIn,
} from '../../services/virtual-user-sign-in.js'
import { getSingletonServices } from '../../pikku-state.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'

/** How `createHttpVirtualUsers` reaches the target app and signs each virtual user in. */
export interface HttpVirtualUsersConfig {
  /**
   * Base API URL of the target app, INCLUDING the HTTP prefix — e.g.
   * `https://app.example.com/api` or `http://localhost:4000/api`. Sign-in is
   * reached at `${apiUrl}${signInPath}` and exposed RPCs at
   * `${apiUrl}${rpcPath}/:rpcName`.
   */
  apiUrl: string
  /**
   * How each virtual user obtains a session: {@link inProcessSignIn} from inside
   * the app, {@link statementSignIn} from outside it.
   */
  signIn: VirtualUserSignIn
  /** Virtual user id → the declaration with its address filled in. */
  virtualUsers: Record<string, ResolvedVirtualUser>
  /**
   * The sign-in path, when the app mounts auth somewhere other than `/auth`.
   * Only the mount is used here, to find `get-session`; signing in itself is
   * the job of {@link HttpVirtualUsersConfig.signIn}.
   */
  signInPath?: string
  /**
   * Where the session (and its roles) is read back. Defaults to `get-session`
   * under the same auth mount as {@link HttpVirtualUsersConfig.signInPath}, so an
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
   * no such field. A virtual user verified against it is verified against a copy.
   */
  rolesRpc?: string | false
  /**
   * Default model a virtual user thinks with when `converse(...)` is called without
   * an explicit `model`. Its own turns/approvals/evaluation run in-process via
   * the configured `agentRunner`.
   */
  model?: string
}

/**
 * Default HTTP-backed virtual user. Signs in lazily on first invoke, holds the
 * session cookies for its lifetime, and re-logs-in once on a 401 mid-run (long
 * health-check runs can outlive a session).
 */
export class HttpVirtualUser implements ScenarioVirtualUser {
  private jar: ScenarioCookieJar
  /**
   * Whether `login()` has succeeded since the last time the session was
   * dropped. The jar cannot answer this — a target may set a cookie before
   * anyone signs in, and it would then look like a session that was never
   * established.
   */
  private signedIn = false
  private signIn: VirtualUserSignIn

  constructor(
    readonly name: string,
    private virtualUser: ResolvedVirtualUser,
    private config: HttpVirtualUsersConfig
  ) {
    this.jar = createCookieJar(config.apiUrl)
    this.signIn = config.signIn
  }

  get email(): string {
    return this.virtualUser.email
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

  async converse(options: ConverseOptions): Promise<ConversationVerdict> {
    const { agentRunner } = getSingletonServices()
    if (!agentRunner) {
      throw new AIProviderNotConfiguredError()
    }
    // Signed in here rather than left to postAgent's 401 retry, which a public
    // agent route never triggers. An unowned thread is minted under a fresh
    // anonymous id per request, so turn one succeeds and turn two is refused as
    // somebody else's — and a virtual user is a real account with real credentials,
    // so there is no case where conversing as nobody is the intent.
    if (!this.signedIn) {
      await this.login()
    }
    const model = options.model ?? this.config.model
    if (!model) {
      throw new Error(
        `[scenario] virtual user '${this.name}' converse needs a model — pass options.model or set 'model' on the virtual users service`
      )
    }
    const threadId = globalThis.crypto.randomUUID()
    const resourceId = `virtualUser:${this.name}`

    return runConversation({
      virtualUser: this.virtualUser,
      virtualUserId: this.name,
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
   * {@link HttpVirtualUsersConfig.rolesRpc} first, then better-auth's
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
    const mount = authMount(this.config.signInPath)
    const sessionPath =
      this.config.sessionPath ?? `${mount ?? '/auth'}/get-session`
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

  /**
   * Start/continue the target agent's run over HTTP as this virtual user.
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
    await this.signIn.login(this.jar, this.virtualUser)
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
 * Build the injected `virtualUsers` service from the declared virtual users: id → lazy
 * HTTP virtual user. Wire the result as the `virtualUsers` singleton service.
 */
export function createHttpVirtualUsers(
  config: HttpVirtualUsersConfig
): ScenarioVirtualUsers {
  const virtualUsers: ScenarioVirtualUsers = {}
  for (const [id, virtualUser] of Object.entries(config.virtualUsers)) {
    virtualUsers[id] = new HttpVirtualUser(id, virtualUser, config)
  }
  return virtualUsers
}
