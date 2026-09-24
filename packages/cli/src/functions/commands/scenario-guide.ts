/**
 * The user guide a scenario suite already contains.
 *
 * A feature reads as a page and a scenario as a section — `pikku scenario
 * guide` is the compiler that joins that to the editorial prose an app checks
 * in under `docs/`, and writes markdown. It renders no HTML, resolves no asset
 * URLs and knows about no website: an image is an ordinary relative
 * `![alt](path)`, and a consumer that needs a different path rewrites it.
 *
 * Nothing here reads the filesystem or the registry. The command assembles a
 * {@link GuideFeature} per registered feature and a {@link GuidePage} per
 * editorial source; everything below is a pure function of those, which is what
 * makes the output byte-identical across runs.
 */
import { createHash } from 'node:crypto'
import { parse, stringify } from 'yaml'

/** One step of a scenario, as the run recorded it. */
export interface GuideStep {
  /** The gherkin keyword the sentence was recorded under: Given, When, Then, And. */
  phase?: string
  /** The sentence itself, without the keyword. */
  sentence: string
}

/** One screenshot a scenario filed, ready to reference. */
export interface GuideScreenshot {
  /** The artifact's stable id, when the run recorded one. */
  id?: string
  /** The caption the scenario author took the shot under; the alt text. */
  name?: string
  /** Taken to be shown, so it leads its scenario's figures. */
  showcase?: boolean
  /**
   * The artifact's content key, relative to the run's artifact root and always
   * forward-slashed — what the record stores, not a path on this machine. A
   * page turns it into a link by prefixing the base it was rendered with.
   */
  path: string
}

/**
 * The recording a scenario filed, when the run kept one.
 *
 * A browser run keeps a video per scenario and per actor, so a two-actor
 * scenario files two. Same shape as a screenshot because a consumer treats it
 * the same way — a key under the run's artifact root that a base is prefixed
 * onto.
 */
export interface GuideVideo {
  id?: string
  /** Whose window it was, when the run recorded more than one. */
  actor?: string
  path: string
}

export interface GuideScenario {
  /** The scenario registration this ran. */
  name: string
  /** What the run labelled it — the registration name, plus its feature and data. */
  title: string
  description?: string
  /**
   * The recorded ladder. Never rendered — a reader wants prose, not a
   * Given/When/Then list — but it is the seed the prose is written from and the
   * input {@link featureEvidence} watches.
   */
  steps: GuideStep[]
  screenshots: GuideScreenshot[]
  /**
   * Optional so that a record predating video, and every fixture written
   * against one, still describes a scenario.
   */
  videos?: GuideVideo[]
}

export interface GuideFeature {
  id: string
  name: string
  description?: string
  /** `document !== false` on the registered feature. */
  document: boolean
  scenarios: GuideScenario[]
}

/** One marker pair on a page. */
export interface GuideCitation {
  featureId: string
  /** The scenario registration the block shows alone; absent, the whole feature. */
  scenario?: string
}

/** One checked-in editorial source, parsed. */
export interface GuidePage {
  /** Path relative to the docs source root, e.g. `deployments/promoting.md`. */
  path: string
  title?: string
  description?: string
  /**
   * The features this page cites, in the order their markers appear. Read off
   * the body rather than declared in frontmatter: see {@link parseGuidePage}.
   */
  features: string[]
  /**
   * Every marker on the page, in order: a feature, and the one scenario of it
   * the block is narrowed to when the marker names one. A page that walks a
   * feature section by section cites it once per section.
   */
  citations: GuideCitation[]
  /**
   * The frontmatter as it was written, every key of it. Carried whole rather
   * than picked apart because a docs site reads its own keys off it — `slug`,
   * `draft`, `sidebar_position` — and a compiler that rebuilt the block from
   * the fields it happens to know about would drop them on the first rebuild.
   */
  frontmatter: Record<string, unknown>
  /** Everything after the frontmatter, generated regions included. */
  body: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Read one editorial source.
 *
 * A page cites a feature by leaving the marker pair where the block belongs —
 * an author writing `<!-- pikku:guide feature=x -->` followed by
 * `<!-- /pikku:guide -->` and nothing between them. That one line is both
 * halves of the job: it says *where* the block goes, which a frontmatter list
 * cannot express, and it is what the coverage gate counts to decide *whether* a
 * feature is documented at all. The mapping stays many-to-many and falls out of
 * the union of every marker in the tree, so a feature written about in three
 * places needs no index to say so.
 */
export const parseGuidePage = (path: string, content: string): GuidePage => {
  const match = content.match(FRONTMATTER)
  if (!match) {
    throw new Error(
      `${path} has no frontmatter — a guide page opens with a \`---\` block carrying at least a title.`
    )
  }
  let frontmatter: any
  try {
    frontmatter = parse(match[1]!) ?? {}
  } catch (e: any) {
    throw new Error(`${path} has unreadable frontmatter: ${e?.message ?? e}`)
  }
  if (frontmatter.features !== undefined) {
    throw new Error(
      `${path} declares \`features:\` in its frontmatter. A page cites a feature by placing \`<!-- pikku:guide feature=<id> -->\` and \`<!-- /pikku:guide -->\` in the body where the block belongs.`
    )
  }
  const body = match[2] ?? ''
  return {
    path,
    ...(typeof frontmatter.title === 'string'
      ? { title: frontmatter.title }
      : {}),
    ...(typeof frontmatter.description === 'string'
      ? { description: frontmatter.description }
      : {}),
    frontmatter,
    features: citedFeatures(body),
    citations: citations(body),
    body,
  }
}

const CITATION =
  /<!--\s*pikku:guide\s+feature=([^\s>]+)(?:\s+scenario=([^\s>]+))?[^>]*-->/g

const citationKey = ({ featureId, scenario }: GuideCitation) =>
  scenario ? `${featureId} ${scenario}` : featureId

const citations = (body: string): GuideCitation[] => {
  const seen = new Map<string, GuideCitation>()
  for (const [, featureId, scenario] of body.matchAll(CITATION)) {
    if (!featureId) {
      continue
    }
    const citation = scenario ? { featureId, scenario } : { featureId }
    if (!seen.has(citationKey(citation))) {
      seen.set(citationKey(citation), citation)
    }
  }
  return [...seen.values()]
}

const citedFeatures = (body: string): string[] => {
  const seen: string[] = []
  for (const [, id] of body.matchAll(CITATION)) {
    if (id && !seen.includes(id)) {
      seen.push(id)
    }
  }
  return seen
}

/**
 * The hash a page's prose is written against.
 *
 * The input is the feature's **step sentences and artifact ids**, and
 * deliberately not the image bytes and not the prose: restyling a UI changes
 * every screenshot and no sentence, while inserting, reordering or renaming a
 * step changes the sentence list — and that is what actually invalidates a
 * paragraph describing the flow. It watches something the reader never sees.
 *
 * Canonically, the hashed value is the JSON of
 * `[[scenarioName, [sentence, …], [artifactId, …]], …]` where:
 *
 * - scenarios are sorted by name then title, because a run's order is a
 *   property of how the suite was selected that day, not of the feature;
 * - sentences keep their ladder order, keyword included, because that order is
 *   the flow being described — the one thing a step change must move;
 * - each sentence is whitespace-collapsed, so the reporter's column padding is
 *   not part of the promise;
 * - artifact ids are sorted, because artifacts are filed as they are finalised
 *   rather than as they were taken.
 *
 * Seven hex characters, like a short commit hash: it is read by a human
 * comparing two lines, not by a collision-resistant protocol.
 */
export const featureEvidence = (feature: GuideFeature): string => {
  const scenarios = [...feature.scenarios]
    .sort(
      (a, b) => a.name.localeCompare(b.name) || a.title.localeCompare(b.title)
    )
    .map((scenario) => [
      scenario.name,
      scenario.steps.map((step) =>
        [step.phase, step.sentence]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      ),
      scenario.screenshots
        .map((shot) => shot.id ?? shot.name ?? shot.path)
        .sort((a, b) => a.localeCompare(b)),
    ])
  return createHash('sha256')
    .update(JSON.stringify(scenarios))
    .digest('hex')
    .slice(0, 7)
}

/**
 * What each documented feature's evidence was the last time the guide was
 * built, keyed by feature id.
 *
 * This is the one piece of machine state the pipeline keeps, and it is kept out
 * of both the marker and the page frontmatter so that no hash is ever typed or
 * merged by hand. It is generated, and it is checked in: a build that cannot
 * read the previous hashes cannot tell stale prose from fresh, so a guide tree
 * whose lock is untracked reports every page as current forever.
 */
export type GuideLock = Record<string, string>

export const parseGuideLock = (content: string): GuideLock => {
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch (e: any) {
    throw new Error(`The guide lock is unreadable: ${e?.message ?? e}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'The guide lock is not an object of feature id to evidence.'
    )
  }
  const lock: GuideLock = {}
  for (const [id, evidence] of Object.entries(parsed)) {
    if (typeof evidence !== 'string') {
      throw new Error(`The guide lock holds a non-string evidence for '${id}'.`)
    }
    lock[id] = evidence
  }
  return lock
}

export const renderGuideLock = (
  features: GuideFeature[],
  cited: Iterable<string>
): string => {
  const documented = new Set(cited)
  const lock: GuideLock = {}
  for (const feature of [...features].sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    if (feature.document && documented.has(feature.id)) {
      lock[feature.id] = featureEvidence(feature)
    }
  }
  return `${JSON.stringify(lock, null, 2)}\n`
}

/** Which features are documented, which pages cite something that is not. */
export interface GuideCoverage {
  /** Registered, documented, and cited by at least one page. */
  cited: string[]
  /** Registered, documented, and cited by no page. */
  missing: string[]
  /** Cited by a page and not registered at all. */
  unknown: Array<{ path: string; featureId: string }>
  /** Cited by a page and registered with `document: false`. */
  optedOut: Array<{ path: string; featureId: string }>
  /** A marker naming a scenario the feature does not register. */
  unknownScenarios: Array<{
    path: string
    featureId: string
    scenario: string
    known: string[]
  }>
  /** Cited, but the run filed no figure for it — a citation that shows nothing. */
  figureless: Array<{ path: string; featureId: string }>
  /** Pages whose locked evidence is not the feature's current evidence. */
  stale: Array<{
    path: string
    featureId: string
    locked: string
    current: string
  }>
}

export const checkGuideCoverage = (
  features: GuideFeature[],
  pages: GuidePage[],
  lock: GuideLock = {}
): GuideCoverage => {
  const byId = new Map(features.map((feature) => [feature.id, feature]))
  const cited = new Set<string>()
  const unknown: GuideCoverage['unknown'] = []
  const optedOut: GuideCoverage['optedOut'] = []
  const figureless: GuideCoverage['figureless'] = []
  const unknownScenarios: GuideCoverage['unknownScenarios'] = []
  const stale: GuideCoverage['stale'] = []
  for (const page of [...pages].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const id of page.features) {
      const feature = byId.get(id)
      if (!feature) {
        unknown.push({ path: page.path, featureId: id })
        continue
      }
      if (!feature.document) {
        optedOut.push({ path: page.path, featureId: id })
        continue
      }
      cited.add(id)
      const figures = feature.scenarios.reduce(
        (total, scenario) =>
          total + scenario.screenshots.length + (scenario.videos?.length ?? 0),
        0
      )
      if (figures === 0) {
        figureless.push({ path: page.path, featureId: id })
      }
      const locked = lock[id]
      const current = featureEvidence(feature)
      if (locked !== undefined && locked !== current) {
        stale.push({ path: page.path, featureId: id, locked, current })
      }
    }
    for (const { featureId, scenario } of page.citations) {
      const feature = byId.get(featureId)
      if (!scenario || !feature?.document) {
        continue
      }
      const known = [...new Set(feature.scenarios.map((s) => s.name))]
      if (!known.includes(scenario)) {
        unknownScenarios.push({ path: page.path, featureId, scenario, known })
      }
    }
  }
  return {
    cited: [...cited].sort((a, b) => a.localeCompare(b)),
    missing: features
      .filter((feature) => feature.document && !cited.has(feature.id))
      .map((feature) => feature.id)
      .sort((a, b) => a.localeCompare(b)),
    unknown,
    unknownScenarios,
    optedOut,
    figureless,
    stale,
  }
}

/**
 * The marker a generated region opens with.
 *
 * An HTML comment, because it is the one thing every markdown renderer already
 * agrees to ignore, and because a page that has been through the compiler still
 * reads as an ordinary document in an editor, a diff and a preview. It carries
 * the feature id, and the scenario when the author narrowed it to one, and
 * nothing else: a rebuild rewrites exactly the block for that citation and
 * leaves every sentence a human wrote — before it, after it, or around another
 * block — untouched, and there is no value on the line anyone has to keep
 * correct.
 */
const generatedOpen = ({ featureId, scenario }: GuideCitation) =>
  scenario
    ? `<!-- pikku:guide feature=${featureId} scenario=${scenario} -->`
    : `<!-- pikku:guide feature=${featureId} -->`

const GENERATED_CLOSE = '<!-- /pikku:guide -->'

/**
 * The `evidence=` attribute is still matched, never written: guides built
 * before the hash moved into the lock carry it, and a rebuild is what removes
 * it.
 */
const generatedRegion = ({ featureId, scenario }: GuideCitation) =>
  new RegExp(
    `<!--\\s*pikku:guide\\s+feature=${escapeRegExp(featureId)}${
      scenario
        ? `\\s+scenario=${escapeRegExp(scenario)}(?![^\\s>])`
        : '(?![^\\s>])(?![^>]*scenario=)'
    }[^>]*-->[\\s\\S]*?${escapeRegExp(GENERATED_CLOSE)}`
  )

/** Any region, for dropping the blocks of features a page no longer cites. */
const ANY_GENERATED_REGION =
  /<!--\s*pikku:guide\s+feature=[^\s]+[^>]*-->[\s\S]*?<!-- \/pikku:guide -->/g

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const GENERATED_CITATION =
  /<!--\s*pikku:guide\s+feature=([^\s>]+)(?:\s+scenario=([^\s>]+))?/

/**
 * One citation's generated region: the figures its run filed, and nothing else.
 *
 * Neither the steps nor the scenario's own title and description are rendered.
 * All three are written to name and prove a test — third person, about the
 * system, ending in the regression they guard — and a reader arriving at a
 * documentation page wants none of it. The words on the page are the author's;
 * what a run can contribute that no author can is the evidence that the words
 * are still true, which is a picture of the thing actually doing it.
 *
 * A marker naming a scenario renders that scenario alone, so a page walking a
 * feature section by section puts each figure under the steps it shows.
 *
 * A data-driven scenario runs once per row and so appears once per row in the
 * record. The rows differ only in their inputs, so their figures are collected
 * in run order and deduplicated by artifact id rather than repeated.
 *
 * Within a scenario the shots taken to be shown lead, then the recording of the
 * whole flow, then the remaining stills. A recording is captioned with its actor
 * only when the scenario filed one per actor — a lone window needs no name. It
 * is emitted as an ordinary figure: this module writes no HTML, so what makes a
 * `.webm` a player rather than a broken image is the consumer's renderer, the
 * same way a consumer resolves the base.
 */
const renderFeature = (
  feature: GuideFeature,
  artifactBase: string,
  scenario?: string
): string => {
  const figures: string[] = []
  const seen = new Set<string>()
  const add = (key: string, figure: string) => {
    if (!seen.has(key)) {
      seen.add(key)
      figures.push(figure)
    }
  }
  for (const each of feature.scenarios) {
    if (scenario && each.name !== scenario) {
      continue
    }
    const shot = (item: GuideScreenshot) =>
      add(
        item.id ?? item.path,
        `![${item.name ?? each.title}](${artifactBase}${item.path})`
      )
    const videos = each.videos ?? []
    const actors = new Set(videos.map((video) => video.actor).filter(Boolean))
    each.screenshots.filter((item) => item.showcase).forEach(shot)
    for (const video of videos) {
      const caption =
        video.actor && actors.size > 1
          ? `${each.title} — ${video.actor}`
          : each.title
      add(video.id ?? video.path, `![${caption}](${artifactBase}${video.path})`)
    }
    each.screenshots.filter((item) => !item.showcase).forEach(shot)
  }
  return figures.join('\n\n')
}

/**
 * Merge one editorial source with the blocks its features generate.
 *
 * Hand-written prose and generated blocks stay separable, so a rebuild never
 * clobbers writing: the body is the author's file, and only the regions between
 * the markers are replaced. A block whose feature the page has stopped citing is
 * dropped, since nothing would ever rewrite it again.
 *
 * `artifactBase` is prefixed onto every artifact key: the relative path from
 * this page to the run's artifact root, which is all this module knows about
 * where anything lives.
 */
export const renderGuidePage = (
  page: GuidePage,
  features: Map<string, GuideFeature>,
  artifactBase: string
): string => {
  const cited = page.citations.filter(({ featureId }) =>
    features.has(featureId)
  )
  const keys = new Set(cited.map(citationKey))
  const first = cited[0] ? features.get(cited[0].featureId) : undefined
  let body = page.body.replace(ANY_GENERATED_REGION, (region) => {
    const [, featureId, scenario] = region.match(GENERATED_CITATION) ?? []
    return featureId && keys.has(citationKey({ featureId, scenario }))
      ? region
      : ''
  })
  for (const citation of cited) {
    const feature = features.get(citation.featureId)!
    const block = [
      generatedOpen(citation),
      renderFeature(feature, artifactBase, citation.scenario),
      GENERATED_CLOSE,
    ]
      .filter((part) => part.length > 0)
      .join('\n\n')
    body = body.replace(generatedRegion(citation), () => block)
  }
  const title = page.title ?? first?.name
  const description = page.description ?? first?.description
  // Only `title` and `description` are the compiler's to fill in, and only when
  // the page states neither; every other key the author wrote passes through in
  // the order they wrote it.
  const { title: _t, description: _d, ...rest } = page.frontmatter
  const frontmatter: Record<string, unknown> = {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...rest,
  }
  const head =
    Object.keys(frontmatter).length > 0
      ? `---\n${stringify(frontmatter, { lineWidth: 0 }).trimEnd()}\n---`
      : '---\n---'
  return `${head}\n\n${trim(body)}\n`
}

const trim = (value: string) => value.replace(/^\n+/, '').replace(/\s+$/, '')

/** The phase a recorded sentence opens with, split back off it. */
const PHASE = /^(Given|When|Then|And)\s+([\s\S]*)$/

/**
 * A recorded step sentence, split into its gherkin keyword and the rest.
 *
 * The run stores the composed sentence — `Given    yasser signs in`, padded to
 * the reporter's keyword column — so the phase is already in it and is read
 * back off the record rather than re-derived from today's source.
 */
export const guideStep = (sentence: string): GuideStep => {
  const match = sentence.trim().match(PHASE)
  return match
    ? { phase: match[1]!, sentence: match[2]!.replace(/\s+/g, ' ').trim() }
    : { sentence: sentence.replace(/\s+/g, ' ').trim() }
}
