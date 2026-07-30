import {
  type KnowledgeFinding,
  type KnowledgeGraph,
  buildKnowledgeGraph,
  readKnowledgeNotes,
  runKnowledgeValidate,
} from '@pikku/knowledge'

export interface KnowledgeBundle extends KnowledgeGraph {
  /** What `pikku knowledge validate` would report, so the console shows the same verdict. */
  findings: KnowledgeFinding[]
  ok: boolean
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
    return { ...graph, ok, findings }
  }
}
