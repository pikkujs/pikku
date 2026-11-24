import type { PikkuWire } from '../../types/core.types.js'

/** The input every attention func receives. */
export type AttentionFuncInput = {
  /** The project whose widget is being checked. */
  projectKey: string
}

/**
 * What an attention func returns when something needs a look. Returning
 * nothing means all is fine.
 */
export type AttentionScore = {
  /** 0 is fine, 1 is on fire. Comparable across funcs and addons, so "most urgent" is a sort by score. */
  score: number
  /** The card data the widget's own screen produces for the same facts. Opaque to Pikku. */
  verdict?: unknown
  /** One plain sentence for why. */
  reason?: string
  /** How many things are affected, for "biggest issue". */
  impact?: number
  /** When it started (ISO time), for "most recent". */
  since?: string
}

/** The body of an attention func: a normal Pikku function body. */
export type AttentionFuncBody<Services = any> = (
  services: Services,
  data: AttentionFuncInput,
  wire: PikkuWire
) =>
  AttentionScore | void | undefined | Promise<AttentionScore | void | undefined>

/** The declaration `pikkuAttentionFunc` returns. */
export type PikkuAttentionFunc<Services = any> = {
  /** A `<screen>.<slot>` id of one of the plugin's own arranged screens. */
  widget: string
  /** How often the stored result is refreshed, as a duration: `1m`, `15m`, `2h`, `1d`. */
  every: string
  func: AttentionFuncBody<Services>
}

/** Inspector-free metadata for every attention func, keyed by widget id. */
export type AttentionFuncMeta = Record<
  string,
  {
    widget: string
    every: string
    /** The cron expression `every` refreshes on. */
    schedule: string
    sourceFile?: string
    exportedName?: string
  }
>

/**
 * How a stored run ended.
 * - `attention`: the func returned a score.
 * - `quiet`: the func returned nothing, so the widget is fine.
 * - `failed`: the check still failed after its retries; the host shows "couldn't check".
 */
export type AttentionStatus = 'attention' | 'quiet' | 'failed'

/** The latest stored run of one attention func for one project. */
export type AttentionResult = {
  projectKey: string
  widget: string
  status: AttentionStatus
  /** Set when `status` is `attention`. */
  score?: AttentionScore
  /** Set when `status` is `failed`. */
  error?: string
  /** When this run finished. */
  updatedAt: Date
}

/** Keeps the latest run per project and widget. */
export interface AttentionResultStore {
  put(result: AttentionResult): Promise<void>
  get(projectKey: string, widget: string): Promise<AttentionResult | undefined>
  /** The latest run of every widget that has stored one for this project, so a host can rank them in one read. */
  list(projectKey: string): Promise<AttentionResult[]>
  /** Every project that has asked for this widget, so the schedule knows whom to refresh. */
  projectKeys(widget: string): Promise<string[]>
  /** Records that a project wants this widget kept fresh, before its first run has stored anything. */
  watch(projectKey: string, widget: string): Promise<void>
}
