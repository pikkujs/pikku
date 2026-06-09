import assert from 'node:assert/strict'
import { Actor } from '../actor.js'
import type { IFunctionWorld } from '../world.js'

type TableLike = { rowsHash: () => Record<string, string> }
type ListTableLike = { rows: () => string[][] }

export interface CucumberStepApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Given: (
    pattern: string | RegExp,
    fn: (this: IFunctionWorld, ...args: any[]) => void | Promise<void>
  ) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  When: (
    pattern: string | RegExp,
    fn: (this: IFunctionWorld, ...args: any[]) => void | Promise<void>
  ) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Then: (
    pattern: string | RegExp,
    fn: (this: IFunctionWorld, ...args: any[]) => void | Promise<void>
  ) => void
  defineParameterType?: (opts: {
    name: string
    regexp: RegExp
    transformer: (s: string) => unknown
  }) => void
}

export interface ActorOptions {
  actors: Map<string, Actor>
  loginRpc?: string
  fixtures?: Map<string, unknown>
}

function tableToInput(table: TableLike): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(table.rowsHash())) {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      value = raw
    }
    const parts = key.split('.')
    let node = out
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i]!
      node[k] ??= {}
      node = node[k] as Record<string, unknown>
    }
    node[parts[parts.length - 1]!] = value
  }
  return out
}

function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce((v, k) => (v as Record<string, unknown>)?.[k], obj)
}

function assertResult(world: IFunctionWorld): Record<string, unknown> {
  if (world.lastError) {
    throw new Error(
      `expected a result but the call threw: ${world.lastError.message}`
    )
  }
  return world.lastResult as Record<string, unknown>
}

function dataMap(world: IFunctionWorld): Map<string, unknown> {
  world.data ??= new Map()
  return world.data
}

function resolveData(world: IFunctionWorld, name: string): unknown {
  return dataMap(world).get(name) ?? null
}

const ERROR_REASON_MAP: Record<string, string> = {
  // HTTP 4xx
  'they are unauthorized': 'UnauthorizedError',
  'payment is required': 'PaymentRequiredError',
  'they are forbidden': 'ForbiddenError',
  'it was not found': 'NotFoundError',
  'the method is not allowed': 'MethodNotAllowedError',
  'the response format is not acceptable': 'NotAcceptableError',
  'the request timed out': 'RequestTimeoutError',
  'there was a conflict': 'ConflictError',
  'the resource is gone': 'GoneError',
  'a precondition failed': 'PreconditionFailedError',
  'the payload is too large': 'PayloadTooLargeError',
  'the media type is not supported': 'UnsupportedMediaTypeError',
  'the content is unprocessable': 'UnprocessableContentError',
  'the resource is locked': 'LockedError',
  'the limit was exceeded': 'TooManyRequestsError',
  'the input is invalid': 'BadRequestError',
  // HTTP 5xx
  'the server errored': 'InternalServerError',
  'it is not implemented': 'NotImplementedError',
  'the gateway errored': 'BadGatewayError',
  'the service is unavailable': 'ServiceUnavailableError',
  'the gateway timed out': 'GatewayTimeoutError',
  // Session
  'the session is invalid': 'InvalidSessionError',
  'there is no session': 'MissingSessionError',
  'the session is read-only': 'ReadonlySessionError',
  // App-level
  'the origin is not allowed': 'InvalidOriginError',
  'a credential is missing': 'MissingCredentialError',
  'it is only available locally': 'LocalEnvironmentOnlyError',
  'the compute time was exceeded': 'MaxComputeTimeReachedError',
  // AI
  'the AI provider auth failed': 'AIProviderAuthError',
  'the AI provider is not configured': 'AIProviderNotConfiguredError',
}

const ERROR_STEP_REGEXP = new RegExp(
  `^the call fails because (${Object.keys(ERROR_REASON_MAP).join('|')})(?: with the message "([^"]*)")?$`
)

function matchTemplateEmail(
  args: unknown[],
  template: string,
  to: string,
  variables?: Record<string, unknown>
): boolean {
  const input = args[0] as Record<string, unknown>
  if (!input || typeof input !== 'object') return false
  const tmpl = input.template as Record<string, unknown> | undefined
  if (!tmpl || tmpl.name !== template) return false
  const toField = input.to
  const toMatch = Array.isArray(toField)
    ? (toField as string[]).includes(to)
    : toField === to
  if (!toMatch) return false
  if (variables) {
    const data = (tmpl.data as Record<string, unknown>) ?? {}
    for (const [k, v] of Object.entries(variables)) {
      if (String(data[k]) !== String(v)) return false
    }
  }
  return true
}

/**
 * Register the built-in step library against the consumer's cucumber instance.
 * Call from hooks.ts:
 *
 *   import { Given, When, Then, defineParameterType } from '@cucumber/cucumber'
 *   import { registerCommonSteps } from '@pikku/cucumber'
 *   registerCommonSteps({ Given, When, Then, defineParameterType }, { actors, fixtures })
 */
export function registerCommonSteps(
  cucumber: CucumberStepApi,
  actorOptions?: ActorOptions
): void {
  // ── Actor parameter type + actor steps ───────────────────────────────────
  if (actorOptions && cucumber.defineParameterType) {
    const { actors, loginRpc } = actorOptions
    cucumber.defineParameterType({
      name: 'actor',
      regexp: new RegExp([...actors.keys()].join('|')),
      transformer: (s: string) => actors.get(s)!,
    })

    cucumber.When(
      '{actor} calls {string}',
      async function (this: IFunctionWorld, actor: Actor, rpc: string) {
        const { result, error } = await actor.call(rpc, null)
        this.lastResult = result
        this.lastError = error
      }
    )

    cucumber.When(
      '{actor} calls {string} with:',
      async function (
        this: IFunctionWorld,
        actor: Actor,
        rpc: string,
        table: TableLike
      ) {
        const { result, error } = await actor.call(rpc, tableToInput(table))
        this.lastResult = result
        this.lastError = error
      }
    )

    cucumber.When(
      '{actor} calls {string} using {string}',
      async function (
        this: IFunctionWorld,
        actor: Actor,
        rpc: string,
        name: string
      ) {
        const { result, error } = await actor.call(rpc, resolveData(this, name))
        this.lastResult = result
        this.lastError = error
      }
    )

    if (loginRpc) {
      cucumber.Given(
        '{actor} logs in',
        async function (this: IFunctionWorld, actor: Actor) {
          await actor.login(loginRpc)
        }
      )
    }
  }

  // ── Anonymous user steps (no actor map needed) ───────────────────────────
  cucumber.When(
    'an anonymous user calls {string}',
    async function (this: IFunctionWorld, rpc: string) {
      const { result, error } = await new Actor('anonymous', {}).call(rpc, null)
      this.lastResult = result
      this.lastError = error
    }
  )

  cucumber.When(
    'an anonymous user calls {string} with:',
    async function (this: IFunctionWorld, rpc: string, table: TableLike) {
      const { result, error } = await new Actor('anonymous', {}).call(
        rpc,
        tableToInput(table)
      )
      this.lastResult = result
      this.lastError = error
    }
  )

  cucumber.When(
    'an anonymous user calls {string} using {string}',
    async function (this: IFunctionWorld, rpc: string, name: string) {
      const { result, error } = await new Actor('anonymous', {}).call(
        rpc,
        resolveData(this, name)
      )
      this.lastResult = result
      this.lastError = error
    }
  )

  // ── Named data map ────────────────────────────────────────────────────────
  cucumber.Given(
    'the data {string} is:',
    function (this: IFunctionWorld, name: string, table: TableLike) {
      dataMap(this).set(name, tableToInput(table))
    }
  )

  // ── Legacy in-process steps (kept for non-HTTP worlds) ───────────────────
  cucumber.Given(
    '{string} has session:',
    function (this: IFunctionWorld, name: string, table: TableLike) {
      this.setSession(name, tableToInput(table))
    }
  )

  cucumber.When(
    '{string} calls {string}',
    async function (this: IFunctionWorld, persona: string, rpc: string) {
      await this.call(persona, rpc, null)
    }
  )

  cucumber.When(
    '{string} calls {string} with:',
    async function (
      this: IFunctionWorld,
      persona: string,
      rpc: string,
      table: TableLike
    ) {
      await this.call(persona, rpc, tableToInput(table))
    }
  )

  // ── Outcome steps ─────────────────────────────────────────────────────────
  cucumber.Then('the call succeeds', function (this: IFunctionWorld) {
    assert.equal(
      this.lastError,
      undefined,
      `expected success but got error: ${this.lastError?.message}`
    )
  })

  cucumber.Then('the call fails', function (this: IFunctionWorld) {
    assert.ok(this.lastError, 'expected the call to fail, but it succeeded')
  })

  cucumber.Then(
    'the call fails with {string}',
    function (this: IFunctionWorld, expected: string) {
      assert.ok(this.lastError, 'expected the call to fail, but it succeeded')
      const actual = `${this.lastError.name}: ${this.lastError.message}`
      assert.ok(
        actual.includes(expected),
        `expected error to include "${expected}" but got "${actual}"`
      )
    }
  )

  cucumber.Then(
    ERROR_STEP_REGEXP,
    function (
      this: IFunctionWorld,
      reason: string,
      message: string | undefined
    ) {
      assert.ok(this.lastError, 'expected the call to fail, but it succeeded')
      const expectedName = ERROR_REASON_MAP[reason]!
      assert.equal(
        this.lastError.name,
        expectedName,
        `expected ${expectedName} but got ${this.lastError.name}: ${this.lastError.message}`
      )
      if (message != null) {
        assert.ok(
          this.lastError.message.includes(message),
          `expected error message to include "${message}" but got "${this.lastError.message}"`
        )
      }
    }
  )

  // ── Result assertions ─────────────────────────────────────────────────────
  cucumber.Then(
    'the result has {string}',
    function (this: IFunctionWorld, key: string) {
      const r = assertResult(this)
      assert.ok(r != null && key in r, `result has no key "${key}"`)
    }
  )

  cucumber.Then(
    'the result {string} is {string}',
    function (this: IFunctionWorld, key: string, value: string) {
      const r = assertResult(this)
      assert.equal(String(getPath(r, key)), value)
    }
  )

  cucumber.Then(
    'the result is a list of {int}',
    function (this: IFunctionWorld, count: number) {
      const r = this.lastResult
      assert.ok(Array.isArray(r), `expected an array but got ${typeof r}`)
      assert.equal(r.length, count)
    }
  )

  // ── Result storage ────────────────────────────────────────────────────────
  cucumber.Then(
    'the result is stored as {string}',
    function (this: IFunctionWorld, name: string) {
      if (this.lastError) {
        throw new Error(
          `expected a result but the call threw: ${this.lastError.message}`
        )
      }
      dataMap(this).set(name, this.lastResult)
    }
  )

  cucumber.Then(
    'the result {string} is stored as {string}',
    function (this: IFunctionWorld, key: string, name: string) {
      const r = assertResult(this)
      dataMap(this).set(name, getPath(r, key))
    }
  )

  // ── Data assertions ───────────────────────────────────────────────────────
  cucumber.Then(
    'the data {string} is {string}',
    function (this: IFunctionWorld, path: string, expected: string) {
      const dot = path.indexOf('.')
      const [mapKey, subPath] =
        dot === -1 ? [path, ''] : [path.slice(0, dot), path.slice(dot + 1)]
      const stored = dataMap(this).get(mapKey!)
      const actual = subPath ? getPath(stored, subPath) : stored
      assert.equal(String(actual), expected)
    }
  )

  cucumber.Then(
    'the data {string} is not empty',
    function (this: IFunctionWorld, path: string) {
      const dot = path.indexOf('.')
      const [mapKey, subPath] =
        dot === -1 ? [path, ''] : [path.slice(0, dot), path.slice(dot + 1)]
      const stored = dataMap(this).get(mapKey!)
      const actual = subPath ? getPath(stored, subPath) : stored
      assert.ok(
        actual != null && actual !== '',
        `expected "${path}" to be non-empty but got: ${JSON.stringify(actual)}`
      )
    }
  )

  // ── Email stub steps (in-process only) ───────────────────────────────────
  cucumber.Then(
    'the {string} email was sent to {string}',
    function (this: IFunctionWorld, template: string, to: string) {
      this.tracker.assertCall(
        'email',
        'send',
        (args) => matchTemplateEmail(args, template, to),
        `"${template}" email to "${to}"`
      )
    }
  )

  cucumber.Then(
    'the {string} email was sent to {string} with:',
    function (
      this: IFunctionWorld,
      template: string,
      to: string,
      table: TableLike
    ) {
      this.tracker.assertCall(
        'email',
        'send',
        (args) => matchTemplateEmail(args, template, to, tableToInput(table)),
        `"${template}" email to "${to}" with matching variables`
      )
    }
  )

  cucumber.Then(
    '{string} emails were sent to:',
    function (
      this: IFunctionWorld,
      template: string,
      table: ListTableLike
    ) {
      for (const [to] of table.rows()) {
        this.tracker.assertCall(
          'email',
          'send',
          (args) => matchTemplateEmail(args, template, to!),
          `"${template}" email to "${to}"`
        )
      }
    }
  )

  cucumber.Then(
    'no {string} email was sent',
    function (this: IFunctionWorld, template: string) {
      this.tracker.assertNoCalls(
        'email',
        'send',
        (args) => {
          const input = args[0] as Record<string, unknown>
          const tmpl = input?.template as Record<string, unknown> | undefined
          return tmpl?.name === template
        },
        `"${template}" email`
      )
    }
  )

  cucumber.Then('no emails were sent', function (this: IFunctionWorld) {
    this.tracker.assertNoCalls('email')
  })

  // ── DB / tracker steps (in-process only) ──────────────────────────────────

  cucumber.Then(
    '{string} where {string} is {string} has {string} equal to {string}',
    async function (
      this: IFunctionWorld,
      table: string,
      whereCol: string,
      whereVal: string,
      col: string,
      expected: string
    ) {
      const rows = await this.readRows(table, whereCol, whereVal)
      assert.ok(
        rows.length,
        `no "${table}" row where ${whereCol} = "${whereVal}"`
      )
      assert.equal(String(rows[0]![col]), expected)
    }
  )

  cucumber.Then(
    'a {string} row where {string} is {string} exists',
    async function (
      this: IFunctionWorld,
      table: string,
      whereCol: string,
      whereVal: string
    ) {
      const rows = await this.readRows(table, whereCol, whereVal)
      assert.ok(
        rows.length,
        `expected a "${table}" row where ${whereCol} = "${whereVal}", found none`
      )
    }
  )

  cucumber.Then(
    'no {string} row where {string} is {string} exists',
    async function (
      this: IFunctionWorld,
      table: string,
      whereCol: string,
      whereVal: string
    ) {
      const rows = await this.readRows(table, whereCol, whereVal)
      assert.equal(
        rows.length,
        0,
        `expected no "${table}" row where ${whereCol} = "${whereVal}", found ${rows.length}`
      )
    }
  )
}
