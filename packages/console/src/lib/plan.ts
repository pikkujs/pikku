/**
 * A milestone's technical plan, as the console renders it.
 *
 * Pure data and pure functions: no React, no I/O, no i18n — the same split as
 * `knowledge.ts`, whose bundle carries these.
 *
 * Mirrors `PlanSchema` in @pikku/knowledge's `plan.ts` and `PlanChecklistItem` in
 * its `plan-meta.ts`, which reach the console inside `console:getKnowledge`. The
 * console has no type-level import of the addon, so the two move together by hand
 * — same arrangement as the note types above them.
 */

export type PlanSlot<T> =
  | { kind: 'built'; description: string; items: T[] }
  | { kind: 'n/a'; description: string }

export type PlanClassification =
  'public' | 'internal' | 'personal' | 'sensitive'

export interface PlanModelField {
  name: string
  type: string
  classification: PlanClassification
}

export interface PlanModelRelationship {
  column: string
  references: string
  onDelete: 'cascade' | 'restrict' | 'orphan'
  provedBy?: string
}

export interface PlanModelItem {
  table: string
  description: string
  fields: PlanModelField[]
  relationships: PlanModelRelationship[]
}

export interface PlanFunctionItem {
  name: string
  description: string
  pass: number
  wire?: { transport: string; route?: string } | null
  scopes: string[]
  permission: string | null
}

export interface PlanUiItem {
  route: string
  description: string
  pass: number
  app?: string
  scenarios: string[]
}

export interface PlanNamedItem {
  name: string
  description: string
}

export interface PlanRoleItem extends PlanNamedItem {
  app?: string
}

export interface PlanScenarioItem {
  feature: string
  scenario: string
  fn?: string
  name?: string
}

export interface PlanCovers {
  note: string
  hash: string
  complete: boolean
}

export interface Plan {
  version: number
  milestone: string
  description: string
  covers: PlanCovers[]
  model: PlanSlot<PlanModelItem>
  functions: PlanSlot<PlanFunctionItem>
  roles: PlanSlot<PlanRoleItem>
  scopes: PlanSlot<PlanNamedItem>
  ui: PlanSlot<PlanUiItem>
  scenarios: {
    backend: PlanSlot<PlanScenarioItem>
    browser: PlanSlot<PlanScenarioItem>
    permission: PlanSlot<PlanScenarioItem>
  }
}

export interface PlanChecklistItem {
  id: string
  label: string
  kind: 'function' | 'wire' | 'scope' | 'scenario'
  done: boolean
  deferred: boolean
}

/** One milestone's plan and what the generated meta can account for. */
export interface MilestonePlan {
  plan: Plan | null
  unavailable: string | null
  checklist: PlanChecklistItem[]
  complete: boolean
}

/** The items a slot holds, or none when it was deliberately left empty. */
export const slotItems = <T>(slot: PlanSlot<T>): T[] =>
  slot.kind === 'built' ? slot.items : []

/**
 * How much of the plan the generated meta can already see, as a fraction.
 *
 * Every checklist row is a set-membership test rather than a self-report, so this
 * counts what exists — not what the build believes it finished.
 *
 * `deferred` is counted separately and NOT subtracted from the total. A milestone
 * that reads `Done` beside `10 of 17` has to say where the other seven went, or the
 * two numbers read as a lie — only the first pass blocks, so those seven were never
 * owed by this build.
 */
export const planChecklistProgress = (
  checklist: PlanChecklistItem[]
): { done: number; total: number; deferred: number } => ({
  done: checklist.filter((item) => item.done).length,
  total: checklist.length,
  deferred: checklist.filter((item) => item.deferred && !item.done).length,
})

/** How many of the rows naming these ids the meta can account for. */
export const planCoverage = (
  checklist: PlanChecklistItem[],
  ids: string[]
): { done: number; total: number } => {
  const wanted = new Set(ids)
  const rows = checklist.filter((item) => wanted.has(item.id))
  return { done: rows.filter((item) => item.done).length, total: rows.length }
}
