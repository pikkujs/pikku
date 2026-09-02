import {
  type KnowledgeFinding,
  type KnowledgeGraph,
  type Plan,
  type PlanChecklistItem,
  buildKnowledgeGraph,
  functionsDirFor,
  planShortfall,
  readKnowledgeNotes,
  readMilestones,
  readPikkuMeta,
  readPlan,
  runKnowledgeValidate,
} from '@pikku/knowledge'

/**
 * One milestone's technical plan, reconciled against the generated meta.
 *
 * The milestone note is the ask — a title and a Gherkin block. The plan beside it is
 * the answer: the tables, functions, roles, screens and scenarios that were promised.
 * The checklist rides along rather than being a second call, because every row is a
 * set-membership test against the same meta read, and a checklist fetched separately
 * could disagree with the plan it is drawn beside.
 */
export interface KnowledgeMilestonePlan {
  plan: Plan | null
  /**
   * Why there is no plan, for the reader to be told instead of being shown an empty
   * one. `readPlan` already separates "nobody wrote one" from "one is there and will
   * not parse", and those want different words in front of a person.
   */
  unavailable: string | null
  checklist: PlanChecklistItem[]
  complete: boolean
}

export interface KnowledgeBundle extends KnowledgeGraph {
  /** What `pikku knowledge validate` would report, so the console shows the same verdict. */
  findings: KnowledgeFinding[]
  ok: boolean
  /** Keyed by the milestone note's path, so a note document can find its own plan. */
  plans: Record<string, KnowledgeMilestonePlan>
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

  private async getPlans(): Promise<Record<string, KnowledgeMilestonePlan>> {
    const milestones = await readMilestones(this.projectRoot)
    if (milestones.length === 0) return {}
    // Read once for every milestone rather than per note: the meta is the whole
    // project's, so re-reading it per plan would say the same thing several times
    // over and let two milestones on one page disagree about what exists.
    const meta = readPikkuMeta(functionsDirFor(this.projectRoot))
    const plans: Record<string, KnowledgeMilestonePlan> = {}
    for (const note of milestones) {
      const read = readPlan(this.projectRoot, note.path)
      if (!read.ok) {
        plans[note.path] = {
          plan: null,
          unavailable: read.reason,
          checklist: [],
          complete: false,
        }
        continue
      }
      const { items, missing } = planShortfall(read.plan, meta)
      plans[note.path] = {
        plan: read.plan,
        unavailable: null,
        checklist: items,
        complete: missing.length === 0,
      }
    }
    return plans
  }
}
