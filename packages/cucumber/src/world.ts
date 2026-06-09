import { rpcService } from '@pikku/core/rpc'
import {
  PikkuSessionService,
  createFunctionSessionWireProps,
} from '@pikku/core/services'
import { fetchData } from '@pikku/core/http'
import { StubTracker } from './tracker.js'
import { createStubHttp } from './stubs/http.js'
import { StubHttpRequest } from './stubs/http-request.js'
import type { StubHttpRequestConfig } from './stubs/http-request.js'
import {
  createStubQueueWire,
  type QueueWireConfig,
  type StubQueueWire,
} from './stubs/queue.js'
import {
  createStubChannelWire,
  type ChannelWireConfig,
  type StubChannelWire,
} from './stubs/channel.js'
import { createStubTriggerWire, type StubTriggerWire } from './stubs/trigger.js'

export type Persona = { name: string; session?: Record<string, unknown> }
export type StubBundle = { services: unknown; kysely?: unknown }
export type StubServicesFactory = (
  dbFile: string,
  tracker: StubTracker
) => Promise<StubBundle>

export interface IFunctionWorld {
  tracker: StubTracker
  services: unknown
  lastResult: unknown
  lastError: Error | undefined
  lastStatus: number | undefined
  lastResponseHeaders: Record<string, string>
  lastQueueWire: StubQueueWire | undefined
  lastChannelWire: StubChannelWire | undefined
  lastTriggerWire: StubTriggerWire | undefined
  nextQueueConfig: QueueWireConfig | undefined
  nextChannelConfig: ChannelWireConfig | undefined
  nextTriggerConfig: boolean | undefined
  data?: Map<string, unknown>
  init(dbFile: string): Promise<void>
  destroy(removeDb: (path: string) => void): Promise<void>
  verify(): void
  readRows(
    table: string,
    whereCol: string,
    whereVal: string
  ): Promise<Record<string, unknown>[]>
  persona(name: string): Persona
  setSession(name: string, session: Record<string, unknown>): void
  call(personaName: string, rpcName: string, data: unknown): Promise<void>
  httpCall(personaName: string, config: StubHttpRequestConfig): Promise<void>
}

/**
 * Create the FunctionWorld class and register it with cucumber.
 * Call once from your world.ts:
 *
 *   import { World, setWorldConstructor } from '@cucumber/cucumber'
 *   import { createFunctionWorld } from '@pikku/cucumber'
 *   import { createStubServices } from './services.js'
 *   createFunctionWorld(World, setWorldConstructor, createStubServices)
 */
export function createFunctionWorld(
  World: new (options: unknown) => object,
  setWorldConstructor: (ctor: unknown) => void,
  factory: StubServicesFactory
): void {
  class FunctionWorldImpl extends (World as new (options: unknown) => {
    attach: unknown
  }) {
    private _bundle!: StubBundle
    private _dbFile!: string
    private _personas = new Map<string, Persona>()
    readonly tracker = new StubTracker()

    get services(): unknown {
      return this._bundle?.services
    }

    lastResult: unknown = undefined
    lastError: Error | undefined = undefined
    lastStatus: number | undefined = undefined
    lastResponseHeaders: Record<string, string> = {}
    lastQueueWire: StubQueueWire | undefined = undefined
    lastChannelWire: StubChannelWire | undefined = undefined
    lastTriggerWire: StubTriggerWire | undefined = undefined
    nextQueueConfig: QueueWireConfig | undefined = undefined
    nextChannelConfig: ChannelWireConfig | undefined = undefined
    nextTriggerConfig: boolean | undefined = undefined

    async init(dbFile: string) {
      this._dbFile = dbFile
      this._bundle = await factory(dbFile, this.tracker)
    }

    async destroy(removeScenarioDb: (path: string) => void) {
      const k = (this._bundle as { kysely?: { destroy?: () => Promise<void> } })
        ?.kysely
      await k?.destroy?.()
      if (this._dbFile) removeScenarioDb(this._dbFile)
    }

    verify() {
      this.tracker.verify()
    }

    async readRows(
      table: string,
      whereColumn: string,
      whereValue: string
    ): Promise<Record<string, unknown>[]> {
      const k = (this._bundle as { kysely?: unknown }).kysely as
        | {
            selectFrom: (t: string) => {
              where: (
                c: string,
                op: string,
                v: string
              ) => {
                selectAll: () => {
                  execute: () => Promise<Record<string, unknown>[]>
                }
              }
            }
          }
        | undefined
      if (!k)
        throw new Error(
          'No kysely in StubBundle — does createStubServices return one?'
        )
      return k
        .selectFrom(table)
        .where(whereColumn, '=', whereValue)
        .selectAll()
        .execute()
    }

    persona(name: string): Persona {
      let p = this._personas.get(name)
      if (!p) {
        p = { name }
        this._personas.set(name, p)
      }
      return p
    }

    setSession(name: string, session: Record<string, unknown>) {
      this.persona(name).session = session
    }

    async call(personaName: string, rpcName: string, data: unknown) {
      const persona = this.persona(personaName)
      const session = new PikkuSessionService()
      if (persona.session) session.setInitial(persona.session as never)

      const http = createStubHttp()

      const queueWire = this.nextQueueConfig
        ? createStubQueueWire(this.nextQueueConfig)
        : undefined
      const channelWire = this.nextChannelConfig
        ? createStubChannelWire(this.nextChannelConfig)
        : undefined
      const triggerWire = this.nextTriggerConfig
        ? createStubTriggerWire()
        : undefined

      const wire: Record<string, unknown> = {
        wireType: 'rpc',
        ...createFunctionSessionWireProps(session),
        http: http.wire,
        ...(queueWire ? { queue: queueWire.wire } : {}),
        ...(channelWire ? { channel: channelWire.wire } : {}),
        ...(triggerWire ? { trigger: triggerWire.wire } : {}),
      }

      const ctx = rpcService.getContextRPCService(
        this._bundle.services as never,
        wire as never,
        { requiresAuth: !!persona.session, sessionService: session }
      )

      this.lastResult = undefined
      this.lastError = undefined
      this.lastStatus = undefined
      this.lastResponseHeaders = {}
      this.lastQueueWire = queueWire
      this.lastChannelWire = channelWire
      this.lastTriggerWire = triggerWire
      this.nextQueueConfig = undefined
      this.nextChannelConfig = undefined
      this.nextTriggerConfig = undefined

      try {
        this.lastResult = await ctx.exposed(rpcName, data)
      } catch (err) {
        this.lastError = err as Error
      } finally {
        this.lastStatus = http.response.statusCode
        this.lastResponseHeaders = http.response.headers
      }
    }

    async httpCall(personaName: string, config: StubHttpRequestConfig) {
      const persona = this.persona(personaName)
      const http = createStubHttp()

      // Inject the test session via the x-test-session header so the
      // highest-priority global middleware can extract it before auth runs.
      const headers: Record<string, string> = { ...config.headers }
      if (persona.session) {
        headers['x-test-session'] = JSON.stringify(persona.session)
      }

      const request = new StubHttpRequest({ ...config, headers })

      this.lastResult = undefined
      this.lastError = undefined
      this.lastStatus = undefined
      this.lastResponseHeaders = {}
      this.lastQueueWire = undefined
      this.lastChannelWire = undefined
      this.lastTriggerWire = undefined
      this.nextQueueConfig = undefined
      this.nextChannelConfig = undefined
      this.nextTriggerConfig = undefined

      try {
        this.lastResult = await fetchData(request, http.response, {
          bubbleErrors: false,
          exposeErrors: true,
        })
      } catch (err) {
        this.lastError = err as Error
      } finally {
        this.lastStatus = http.response.statusCode
        this.lastResponseHeaders = http.response.headers
      }
    }
  }

  setWorldConstructor(FunctionWorldImpl)
}
