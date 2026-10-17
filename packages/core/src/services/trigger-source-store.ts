import type { WebhookSourceState } from '../wirings/trigger/webhook-source.types.js'

/** The kinds of trigger source a provider can be registered for. */
export type TriggerSourceKind = 'webhook'

/**
 * A trigger source as declared in code, before anything is registered with its
 * provider.
 */
export type DeclaredTriggerSource = {
  name: string
  kind: TriggerSourceKind
  /** Where the running app is served and how it labels provider endpoints: what enabling a source registers it with. */
  baseUrl?: string
  labelPrefix?: string
}

/**
 * What was registered with the provider for one declared trigger source.
 * `state` is what the last `setup` returned — provider identifiers only; any
 * secret it issued lives in the credential service.
 */
export type TriggerSourceRow = Required<
  Pick<DeclaredTriggerSource, 'name' | 'kind'>
> & {
  baseUrl: string | null
  labelPrefix: string | null
  /** False once the declaration has gone from code without a teardown: an orphan. */
  declared: boolean
  /** Only an enabled source is registered with its provider or receives events. Off until someone turns it on. */
  enabled: boolean
  status: string | null
  state: WebhookSourceState | null
  /** The last step's instructions or error. */
  detail: string | null
  updatedAt: string | null
}

/** The outcome of a setup or teardown step for a trigger source. */
export type TriggerSourceResult = {
  status: string
  state?: WebhookSourceState | null
  detail?: string | null
}

/** What each declared trigger source registered with its provider. */
export interface TriggerSourceStore {
  /** Upserts the declared sources, keeping a known address when none is given, and marks the rest undeclared. */
  syncTriggerSources(sources: DeclaredTriggerSource[]): Promise<void>
  listTriggerSources(): Promise<TriggerSourceRow[]>
  getTriggerSource(name: string): Promise<TriggerSourceRow | null>
  recordTriggerSource(name: string, result: TriggerSourceResult): Promise<void>
  setTriggerSourceEnabled(name: string, enabled: boolean): Promise<void>
  deleteTriggerSource(name: string): Promise<void>
}

/**
 * A {@link TriggerSourceStore} held in process memory, for development and
 * tests. Registrations are lost on restart.
 *
 * @throws Error from `recordTriggerSource` and `setTriggerSourceEnabled` when
 * the source is unknown
 */
export class InMemoryTriggerSourceStore implements TriggerSourceStore {
  private rows = new Map<string, TriggerSourceRow>()

  async syncTriggerSources(sources: DeclaredTriggerSource[]) {
    const names = new Set(sources.map((s) => s.name))
    for (const row of this.rows.values()) {
      row.declared = names.has(row.name)
    }
    for (const { name, kind, baseUrl, labelPrefix } of sources) {
      const row = this.rows.get(name)
      if (row) {
        row.kind = kind
        if (baseUrl !== undefined) row.baseUrl = baseUrl
        if (labelPrefix !== undefined) row.labelPrefix = labelPrefix
        continue
      }
      this.rows.set(name, {
        name,
        kind,
        baseUrl: baseUrl ?? null,
        labelPrefix: labelPrefix ?? null,
        declared: true,
        enabled: false,
        status: null,
        state: null,
        detail: null,
        updatedAt: null,
      })
    }
  }

  async listTriggerSources() {
    return [...this.rows.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ ...row }))
  }

  async getTriggerSource(name: string) {
    const row = this.rows.get(name)
    return row ? { ...row } : null
  }

  async recordTriggerSource(name: string, result: TriggerSourceResult) {
    const row = this.rows.get(name)
    if (!row) throw new Error(`Unknown trigger source: ${name}`)
    row.status = result.status
    if (result.state !== undefined) row.state = result.state
    row.detail = result.detail ?? null
    row.updatedAt = new Date().toISOString()
  }

  async setTriggerSourceEnabled(name: string, enabled: boolean) {
    const row = this.rows.get(name)
    if (!row) throw new Error(`Unknown trigger source: ${name}`)
    row.enabled = enabled
  }

  async deleteTriggerSource(name: string) {
    this.rows.delete(name)
  }
}
