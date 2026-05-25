import { rpcService } from '@pikku/core/rpc'
import {
  PikkuSessionService,
  createFunctionSessionWireProps,
} from '@pikku/core/services'
import { StubTracker } from './tracker.js'

export type Persona = { name: string; session?: Record<string, unknown> }
export type StubBundle = { services: unknown; kysely?: unknown }
export type StubServicesFactory = (
  dbFile: string,
  tracker: StubTracker
) => Promise<StubBundle>

export interface IFunctionWorld {
  tracker: StubTracker
  lastResult: unknown
  lastError: Error | undefined
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
}

function stubHttp() {
  const cookies = new Map<string, string>()
  return {
    wire: {
      request: { cookie: (name: string) => cookies.get(name) },
      response: {
        cookie: (name: string, value: string) => cookies.set(name, value),
      },
    },
  }
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

    lastResult: unknown = undefined
    lastError: Error | undefined = undefined

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

      const http = stubHttp()
      const wire = {
        wireType: 'rpc',
        ...createFunctionSessionWireProps(session),
        http: http.wire,
      }

      const ctx = rpcService.getContextRPCService(
        this._bundle.services as never,
        wire as never,
        { requiresAuth: !!persona.session, sessionService: session }
      )

      this.lastResult = undefined
      this.lastError = undefined
      try {
        this.lastResult = await ctx.exposed(rpcName, data)
      } catch (err) {
        this.lastError = err as Error
      }
    }
  }

  setWorldConstructor(FunctionWorldImpl)
}
