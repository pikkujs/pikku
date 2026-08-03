import { toEnglishName } from '../../lib/strings'

/**
 * The console's own display bands, which are core's three phases plus `step`.
 *
 * `step` is not a phase a scenario can write — it is what a ladder row gets
 * when it is not a scenario step at all: a repeat header, or an RPC the
 * scenario ran directly. Those rows carry no keyword, and giving them one
 * would claim they said something the scenario never said.
 */
export type ScenarioStepPhase = 'given' | 'when' | 'then' | 'step'

export interface ScenarioLadderStep {
  id: string
  phase: ScenarioStepPhase
  /** The declared prose for this step — what a reader of the spec sees. */
  sentence: string
  actor?: string
  /** Nesting depth; a step inside a repeat reads indented beneath it. */
  depth: number
  /**
   * Set on a repeat header rather than an executed step — a scenario looping
   * over a list compiles to a fanout, and reads as "for each x in xs".
   */
  repeat?: { itemVar: string; sourceVar: string }
}

export interface ScenarioDoc {
  name: string
  title: string
  description?: string
  /** The scenario's own tags unioned with every containing feature's. */
  tags: string[]
  actors: string[]
  /** Why this scenario is held out of a default run, in the author's words. */
  skip?: string
  steps: ScenarioLadderStep[]
}

export interface FeatureDocEntry {
  scenario: ScenarioDoc
  /** The input this entry runs the scenario with — gherkin's `Examples:`. */
  data?: unknown
}

export interface FeatureDoc {
  id: string
  name: string
  description?: string
  tags: string[]
  hasBefore: boolean
  hasAfter: boolean
  /** Non-zero means this listing is partial — see `FeatureMeta`. */
  unresolvedEntries: number
  scenarios: FeatureDocEntry[]
}

export interface ScenarioDocs {
  features: FeatureDoc[]
  /** Scenarios belonging to no feature — still first-class, just unfiled. */
  ungrouped: ScenarioDoc[]
  /** Every distinct tag across features and scenarios, for the filter. */
  tags: string[]
}

interface RawNode {
  nodeId: string
  flow?: string
  rpcName?: string
  actor?: string
  scenarioStepPhase?: string
  branches?: unknown[]
  next?: string
  sourceVar?: string
  itemVar?: string
  childEntry?: string
}

interface RawScenario {
  name: string
  source?: string
  scenario?: boolean
  title?: string
  description?: string
  summary?: string
  tags?: string[]
  actors?: string[]
  skip?: string
  nodes?: Record<string, RawNode>
  entryNodeIds?: string[]
}

interface RawFeature {
  id: string
  name: string
  description?: string
  tags?: string[]
  entries?: Array<{ scenario: string; data?: unknown }>
  unresolvedEntries?: number
  hasBefore?: boolean
  hasAfter?: boolean
}

export interface BuildScenarioDocsInput {
  workflows: Record<string, unknown> | undefined
  features: Record<string, unknown> | undefined
}

const PHASES: ScenarioStepPhase[] = ['given', 'when', 'then', 'step']

const isScenario = (workflow: RawScenario): boolean =>
  workflow.source === 'scenario' || workflow.scenario === true

const isStructuralBranch = (node: RawNode): boolean =>
  node.flow === 'branch' &&
  (!node.branches || node.branches.length === 0) &&
  !node.rpcName

/**
 * A step's sentence is its node id, because a scenario names its steps in
 * prose (`scenario.given('opens the addons page', …)`). A positional
 * `step_<n>` is one the author never named, so the rpc stands in for it.
 *
 * A name built from a template literal keeps its placeholder, but written the
 * way a reader expects one — `sees {packageName}`, not `sees ${packageName}`.
 */
const sentenceOf = (node: RawNode): string => {
  const raw = /^step_\d+$/.test(node.nodeId)
    ? (node.rpcName ?? node.nodeId)
    : node.nodeId
  return raw.replace(/\$\{([^}]*)\}/g, '{$1}')
}

const phaseOf = (node: RawNode): ScenarioStepPhase => {
  const phase = node.scenarioStepPhase as ScenarioStepPhase | undefined
  return phase && PHASES.includes(phase) ? phase : 'step'
}

const buildLadder = (workflow: RawScenario): ScenarioLadderStep[] => {
  const nodes = workflow.nodes
  if (!nodes) return []

  const steps: ScenarioLadderStep[] = []
  const visited = new Set<string>()

  const emit = (node: RawNode, depth: number) => {
    if (isStructuralBranch(node) || node.flow === 'return') return

    if (node.flow === 'fanout') {
      steps.push({
        id: node.nodeId,
        phase: 'step',
        sentence: '',
        depth,
        repeat: {
          itemVar: node.itemVar ?? 'item',
          sourceVar: node.sourceVar ?? '',
        },
      })
      walk(node.childEntry, depth + 1)
      return
    }

    steps.push({
      id: node.nodeId,
      phase: phaseOf(node),
      sentence: sentenceOf(node),
      depth,
      ...(node.actor ? { actor: node.actor } : {}),
    })
  }

  const walk = (startId: string | undefined, depth: number) => {
    let current = startId
    while (current && nodes[current] && !visited.has(current)) {
      visited.add(current)
      const node = nodes[current]
      emit(node, depth)
      current = node.next
    }
  }

  const roots =
    workflow.entryNodeIds && workflow.entryNodeIds.length > 0
      ? workflow.entryNodeIds
      : [Object.keys(nodes)[0]]
  for (const root of roots) walk(root, 0)
  for (const id of Object.keys(nodes)) {
    if (!visited.has(id)) walk(id, 0)
  }

  return steps
}

const toDoc = (workflow: RawScenario, featureTags: string[]): ScenarioDoc => ({
  name: workflow.name,
  title: workflow.title ?? toEnglishName(workflow.name),
  ...(workflow.description || workflow.summary
    ? { description: workflow.description ?? workflow.summary }
    : {}),
  tags: [...new Set([...featureTags, ...(workflow.tags ?? [])])].sort(),
  actors: workflow.actors ?? [],
  ...(workflow.skip ? { skip: workflow.skip } : {}),
  steps: buildLadder(workflow),
})

/**
 * The scenario section's document model: features as pages, each holding the
 * scenarios it declares, each of those a ladder of prose steps.
 *
 * Declared order is preserved throughout — a feature reads top to bottom the
 * way it was written, the way a gherkin Feature file does — so nothing here
 * sorts scenarios or steps. Only features and the tag list are sorted, since
 * neither has an authored order.
 */
export function buildScenarioDocs({
  workflows,
  features,
}: BuildScenarioDocsInput): ScenarioDocs {
  const scenarios = new Map<string, RawScenario>()
  for (const value of Object.values(workflows ?? {})) {
    const workflow = value as RawScenario
    if (!isScenario(workflow)) continue
    if ((workflow.tags ?? []).includes('test-fixture')) continue
    scenarios.set(workflow.name, workflow)
  }

  const grouped = new Set<string>()
  const featureDocs: FeatureDoc[] = []

  for (const value of Object.values(features ?? {})) {
    const feature = value as RawFeature
    const featureTags = feature.tags ?? []
    const entries: FeatureDocEntry[] = []

    for (const entry of feature.entries ?? []) {
      const workflow = scenarios.get(entry.scenario)
      if (!workflow) continue
      grouped.add(entry.scenario)
      entries.push({
        scenario: toDoc(workflow, featureTags),
        ...(entry.data === undefined ? {} : { data: entry.data }),
      })
    }

    featureDocs.push({
      id: feature.id,
      name: feature.name,
      ...(feature.description ? { description: feature.description } : {}),
      tags: featureTags,
      hasBefore: feature.hasBefore ?? false,
      hasAfter: feature.hasAfter ?? false,
      unresolvedEntries: feature.unresolvedEntries ?? 0,
      scenarios: entries,
    })
  }

  featureDocs.sort((a, b) => a.name.localeCompare(b.name))

  const ungrouped = [...scenarios.values()]
    .filter((workflow) => !grouped.has(workflow.name))
    .map((workflow) => toDoc(workflow, []))
    .sort((a, b) => a.title.localeCompare(b.title))

  const tags = new Set<string>()
  for (const feature of featureDocs) {
    for (const tag of feature.tags) tags.add(tag)
    for (const entry of feature.scenarios) {
      for (const tag of entry.scenario.tags) tags.add(tag)
    }
  }
  for (const scenario of ungrouped) {
    for (const tag of scenario.tags) tags.add(tag)
  }

  return {
    features: featureDocs,
    ungrouped,
    tags: [...tags].sort(),
  }
}

export interface ScenarioDocFilter {
  query?: string
  /** Match-any, mirroring `pikku scenario run --tags`. Empty means no filter. */
  tags?: string[]
}

const matchesQuery = (scenario: ScenarioDoc, needle: string): boolean =>
  scenario.title.toLowerCase().includes(needle) ||
  scenario.name.toLowerCase().includes(needle) ||
  (scenario.description?.toLowerCase().includes(needle) ?? false) ||
  scenario.steps.some((step) => step.sentence.toLowerCase().includes(needle))

const matchesTags = (scenario: ScenarioDoc, tags: string[]): boolean =>
  tags.length === 0 || tags.some((tag) => scenario.tags.includes(tag))

/**
 * Narrows the document to what matches, keeping a feature only while it still
 * has a scenario to show. A feature whose own name matches the query keeps all
 * of its scenarios — searching for a feature should open it, not empty it.
 */
export function filterFeatures(
  features: FeatureDoc[],
  { query, tags = [] }: ScenarioDocFilter
): FeatureDoc[] {
  const needle = query?.trim().toLowerCase() ?? ''
  if (!needle && tags.length === 0) return features

  const filtered: FeatureDoc[] = []
  for (const feature of features) {
    const featureMatchesQuery =
      !needle ||
      feature.name.toLowerCase().includes(needle) ||
      (feature.description?.toLowerCase().includes(needle) ?? false)

    const scenarios = feature.scenarios.filter(
      (entry) =>
        (featureMatchesQuery || matchesQuery(entry.scenario, needle)) &&
        matchesTags(entry.scenario, tags)
    )

    if (scenarios.length > 0) {
      filtered.push({ ...feature, scenarios })
    }
  }
  return filtered
}
