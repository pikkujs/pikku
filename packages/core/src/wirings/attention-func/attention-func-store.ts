import type {
  AttentionResult,
  AttentionResultStore,
} from './attention-func.types.js'

/** The default store: results live as long as the process. */
export class InMemoryAttentionResultStore implements AttentionResultStore {
  private results = new Map<string, AttentionResult>()
  private watched = new Map<string, Set<string>>()

  private key(projectKey: string, widget: string) {
    return `${widget}\u0000${projectKey}`
  }

  async put(result: AttentionResult) {
    await this.watch(result.projectKey, result.widget)
    this.results.set(this.key(result.projectKey, result.widget), {
      ...result,
    })
  }

  async get(projectKey: string, widget: string) {
    const found = this.results.get(this.key(projectKey, widget))
    return found ? { ...found } : undefined
  }

  async list(projectKey: string) {
    return [...this.results.values()]
      .filter((result) => result.projectKey === projectKey)
      .map((result) => ({ ...result }))
  }

  async projectKeys(widget: string) {
    return [...(this.watched.get(widget) ?? [])]
  }

  async watch(projectKey: string, widget: string) {
    const keys = this.watched.get(widget) ?? new Set<string>()
    keys.add(projectKey)
    this.watched.set(widget, keys)
  }
}

const fallback = new InMemoryAttentionResultStore()

/** The store a runtime uses: the host's `attentionResults` service, else the in-process one. */
export const attentionResultStore = (services: {
  attentionResults?: AttentionResultStore
}): AttentionResultStore => services.attentionResults ?? fallback
