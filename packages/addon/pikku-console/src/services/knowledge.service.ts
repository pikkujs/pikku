import {
  type KnowledgeFinding,
  type KnowledgeGraph,
  type PlanChecklistItem,
  buildKnowledgeGraph,
  functionsDirFor,
  planShortfall,
  readKnowledgeNotes,
  readPikkuMeta,
  readPlans,
  runKnowledgeValidate,
} from '@pikku/knowledge'

/**
 * The plan as it goes over the wire.
 *
 * Structurally the same as `Plan` in @pikku/knowledge, restated as plain interfaces
 * because that one is inferred from a zod schema, and schema generation cannot walk
 * an inferred type that deep — the whole bundle then names a schema nobody
 * generated, and `getKnowledge` fails at runtime with `MissingSchemaError`.
 *
 * Nothing here is free to drift: `readPlans` hands back the zod type and it is
 * assigned straight into this field, so a plan schema that grows a case these
 * interfaces do not have stops compiling.
 */
export type PlanSlot<T> =
  | { kind: 'built'; description: string; items: T[] }
  | { kind: 'n/a'; description: string }

export interface PlanModelField {
  name: string
  type: string
  classification: 'public' | 'internal' | 'personal' | 'sensitive'
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

export interface WirePlan {
  version: number
  changeset: string
  surface: 'app' | 'cli' | 'mcp' | 'agent' | 'backend'
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

/**
 * One changeset's technical plan, reconciled against the generated meta.
 *
 * The changeset's changes are the ask. The plan is the answer: the tables, functions,
 * roles, screens and scenarios that were promised.
 * The checklist rides along rather than being a second call, because every row is a
 * set-membership test against the same meta read, and a checklist fetched separately
 * could disagree with the plan it is drawn beside.
 */
export interface KnowledgePlan {
  plan: WirePlan | null
  /**
   * Why there is no plan, for the reader to be told instead of being shown an empty
   * one: a plan file that will not parse wants different words in front of a person
   * than one that reads.
   */
  unavailable: string | null
  checklist: PlanChecklistItem[]
  complete: boolean
}

export interface KnowledgeBundle extends KnowledgeGraph {
  /** What `pikku knowledge validate` would report, so the console shows the same verdict. */
  findings: KnowledgeFinding[]
  ok: boolean
  /** Keyed by changeset, or by the plan file's path when it will not parse. */
  plans: Record<string, KnowledgePlan>
}

/**
 * Reads the project's `knowledge/` notes off disk on every call.
 *
 * There is no cache: the notes are files a developer or an agent edits while the
 * console is open, and a stale graph is worse than a slow one — a reader would be
 * shown a base that no longer exists. Bundles are small enough that a re-read per
 * request is cheaper than any invalidation scheme would be to get right.
 */
export class KnowledgeService {
  constructor(
    private readonly projectRoot: string,
    private readonly outDir: string
  ) {}

  async getBundle(): Promise<KnowledgeBundle> {
    // One read, both graphed and validated. Letting validate re-read would let a
    // save land between the two, and the page would then carry findings about a
    // note it is not showing — the one situation where a reader cannot act on
    // what they are being told.
    const notes = await readKnowledgeNotes(this.projectRoot)
    const graph = buildKnowledgeGraph(notes)
    const { ok, findings } = await runKnowledgeValidate(
      this.projectRoot,
      this.outDir,
      notes
    )
    return { ...graph, ok, findings, plans: await this.getPlans() }
  }

  private async getPlans(): Promise<Record<string, KnowledgePlan>> {
    const reads = readPlans(this.projectRoot)
    if (reads.length === 0) return {}
    // Read once for every plan rather than per plan: the meta is the whole project's,
    // so re-reading it per plan would let two plans on one page disagree about what
    // exists.
    const meta = readPikkuMeta(functionsDirFor(this.projectRoot))
    const plans: Record<string, KnowledgePlan> = {}
    for (const read of reads) {
      if (!read.ok) {
        plans[read.path] = {
          plan: null,
          unavailable: read.reason,
          checklist: [],
          complete: false,
        }
        continue
      }
      const { items, missing } = planShortfall(read.plan, meta)
      plans[read.plan.changeset] = {
        plan: read.plan,
        unavailable: null,
        checklist: items,
        complete: missing.length === 0,
      }
    }
    return plans
  }
}
