/**
 * The user guide a scenario suite already contains.
 *
 * A feature reads as a page, a scenario as a section, and a step as a sentence
 * somebody wrote in English — `pikku scenario guide` is the compiler that joins
 * that to the editorial prose an app checks in under `docs/`, and writes
 * markdown. It renders no HTML, resolves no asset URLs and knows about no
 * website: an image is an ordinary relative `![alt](path)`, and a consumer that
 * needs a different path rewrites it.
 *
 * Nothing here reads the filesystem or the registry. The command assembles a
 * {@link GuideFeature} per registered feature and a {@link GuidePage} per
 * editorial source; everything below is a pure function of those, which is what
 * makes the output byte-identical across runs.
 */
import { createHash } from 'node:crypto'
import { parse } from 'yaml'

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
  /**
   * The artifact's content key, relative to the run's artifact root and always
   * forward-slashed — what the record stores, not a path on this machine. A
   * page turns it into a link by prefixing the base it was rendered with.
   */
  path: string
}

export interface GuideScenario {
  /** The scenario registration this ran. */
  name: string
  /** What the run labelled it — the registration name, plus its feature and data. */
  title: string
  description?: string
  steps: GuideStep[]
  screenshots: GuideScreenshot[]
}

export interface GuideFeature {
  id: string
  name: string
  description?: string
  /** `document !== false` on the registered feature. */
  document: boolean
  scenarios: GuideScenario[]
}

/** A feature an editorial page claims to cover. */
export interface GuidePageFeature {
  id: string
  /**
   * The evidence hash the prose was written against, as
   * {@link featureEvidence} computed it. Absent on a page that has never been
   * built; different from the current one means the sentences moved under the
   * prose. Written quoted, because a hash of nothing but digits is a YAML
   * number and loses its leading zeros.
   */
  evidence?: string
}

/** One checked-in editorial source, parsed. */
export interface GuidePage {
  /** Path relative to the docs source root, e.g. `deployments/promoting.md`. */
  path: string
  title?: string
  description?: string
  features: GuidePageFeature[]
  /** Everything after the frontmatter, generated regions included. */
  body: string
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

/**
 * Read one editorial source.
 *
 * A page declares which features it covers; nobody declares where a feature is
 * documented. The mapping is many-to-many and falls out of the union of these
 * lists, so a feature written about in three places needs no index to say so.
 */
export const parseGuidePage = (path: string, content: string): GuidePage => {
  const match = content.match(FRONTMATTER)
  if (!match) {
    throw new Error(
      `${path} has no frontmatter — a guide page declares the features it covers in a \`features:\` list.`
    )
  }
  let frontmatter: any
  try {
    frontmatter = parse(match[1]!) ?? {}
  } catch (e: any) {
    throw new Error(`${path} has unreadable frontmatter: ${e?.message ?? e}`)
  }
  const declared = frontmatter.features
  if (declared !== undefined && !Array.isArray(declared)) {
    throw new Error(
      `${path} declares \`features:\` as something other than a list.`
    )
  }
  const features: GuidePageFeature[] = (declared ?? []).map((entry: any) => {
    if (typeof entry === 'string') {
      return { id: entry }
    }
    if (entry && typeof entry.id === 'string') {
      return entry.evidence === undefined
        ? { id: entry.id }
        : { id: entry.id, evidence: String(entry.evidence) }
    }
    throw new Error(
      `${path} has a \`features:\` entry that is neither a feature id nor an { id, evidence } pair.`
    )
  })
  return {
    path,
    ...(typeof frontmatter.title === 'string'
      ? { title: frontmatter.title }
      : {}),
    ...(typeof frontmatter.description === 'string'
      ? { description: frontmatter.description }
      : {}),
    features,
    body: match[2] ?? '',
  }
}

/**
 * The hash a page's prose is written against.
 *
 * The input is the feature's **step sentences and artifact ids**, and
 * deliberately not the image bytes: restyling a UI changes every screenshot and
 * no sentence, while inserting, reordering or renaming a step changes the
 * sentence list — and that is what actually invalidates a paragraph describing
 * the flow.
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

/** Which features are documented, which pages cite something that is not. */
export interface GuideCoverage {
  /** Registered, documented, and cited by no page. */
  missing: string[]
  /** Cited by a page and not registered at all. */
  unknown: Array<{ path: string; featureId: string }>
  /** Cited by a page and registered with `document: false`. */
  optedOut: Array<{ path: string; featureId: string }>
  /** Pages whose declared evidence is not the feature's current evidence. */
  stale: Array<{
    path: string
    featureId: string
    declared: string
    current: string
  }>
}

export const checkGuideCoverage = (
  features: GuideFeature[],
  pages: GuidePage[]
): GuideCoverage => {
  const byId = new Map(features.map((feature) => [feature.id, feature]))
  const cited = new Set<string>()
  const unknown: GuideCoverage['unknown'] = []
  const optedOut: GuideCoverage['optedOut'] = []
  const stale: GuideCoverage['stale'] = []
  for (const page of [...pages].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const { id, evidence } of page.features) {
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
      const current = featureEvidence(feature)
      if (evidence !== undefined && evidence !== current) {
        stale.push({
          path: page.path,
          featureId: id,
          declared: evidence,
          current,
        })
      }
    }
  }
  return {
    missing: features
      .filter((feature) => feature.document && !cited.has(feature.id))
      .map((feature) => feature.id)
      .sort((a, b) => a.localeCompare(b)),
    unknown,
    optedOut,
    stale,
  }
}

/**
 * The marker a generated region opens with.
 *
 * An HTML comment, because it is the one thing every markdown renderer already
 * agrees to ignore, and because a page that has been through the compiler still
 * reads as an ordinary document in an editor, a diff and a preview. The region
 * is keyed by feature id, so a rebuild rewrites exactly the block for that
 * feature and leaves every sentence a human wrote — before it, after it, or
 * around another feature's block — untouched. The evidence hash rides along on
 * the open marker so the emitted page says what it was built from.
 */
const generatedOpen = (featureId: string, evidence: string) =>
  `<!-- pikku:guide feature=${featureId} evidence=${evidence} -->`

const GENERATED_CLOSE = '<!-- /pikku:guide -->'

const generatedRegion = (featureId: string) =>
  new RegExp(
    `<!-- pikku:guide feature=${escapeRegExp(featureId)}(?: evidence=[0-9a-f]+)? -->[\\s\\S]*?${escapeRegExp(
      GENERATED_CLOSE
    )}`
  )

/** Any region, for dropping the blocks of features a page no longer cites. */
const ANY_GENERATED_REGION =
  /<!-- pikku:guide feature=[^\s]+(?: evidence=[0-9a-f]+)? -->[\s\S]*?<!-- \/pikku:guide -->/g

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const GENERATED_FEATURE = /<!-- pikku:guide feature=([^\s]+)/

/** One feature's generated section: its scenarios, their sentences, their shots. */
const renderFeature = (feature: GuideFeature, artifactBase: string): string => {
  const blocks: string[] = []
  for (const scenario of feature.scenarios) {
    const section: string[] = [`## ${scenario.title}`]
    if (scenario.description) {
      section.push('', scenario.description)
    }
    if (scenario.steps.length > 0) {
      section.push('')
      scenario.steps.forEach((step, index) => {
        const phase = step.phase ? `**${step.phase}** ` : ''
        section.push(`${index + 1}. ${phase}${step.sentence}`)
      })
    }
    for (const shot of scenario.screenshots) {
      section.push(
        '',
        `![${shot.name ?? scenario.title}](${artifactBase}${shot.path})`
      )
    }
    blocks.push(section.join('\n'))
  }
  return blocks.join('\n\n')
}

/**
 * Merge one editorial source with the blocks its features generate.
 *
 * Hand-written prose and generated blocks stay separable, so a rebuild never
 * clobbers writing: the body is the author's file, and only the regions between
 * the markers are replaced. A feature cited for the first time gets its block
 * appended; a block whose feature the page has stopped citing is dropped, since
 * nothing would ever rewrite it again.
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
  const cited = page.features
    .map(({ id }) => id)
    .filter((id) => features.has(id))
  const first = cited[0] ? features.get(cited[0]) : undefined
  let body = page.body.replace(ANY_GENERATED_REGION, (region) => {
    const id = region.match(GENERATED_FEATURE)?.[1]
    return id && cited.includes(id) ? region : ''
  })
  for (const id of cited) {
    const feature = features.get(id)!
    const block = [
      generatedOpen(id, featureEvidence(feature)),
      renderFeature(feature, artifactBase),
      GENERATED_CLOSE,
    ]
      .filter((part) => part.length > 0)
      .join('\n\n')
    const region = generatedRegion(id)
    body = region.test(body)
      ? body.replace(region, block)
      : `${trim(body)}\n\n${block}`
  }
  const title = page.title ?? first?.name
  const description = page.description ?? first?.description
  // The emitted page is a valid source for the next build: it declares the same
  // features, each at the evidence it was just written from. That is what makes
  // emitting over the editorial sources themselves the way an author refreshes
  // a stale hash, rather than transcribing it by hand.
  const frontmatter = [
    '---',
    ...(title ? [`title: ${JSON.stringify(title)}`] : []),
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    ...(cited.length > 0
      ? [
          'features:',
          ...cited.flatMap((id) => [
            `  - id: ${id}`,
            `    evidence: ${JSON.stringify(featureEvidence(features.get(id)!))}`,
          ]),
        ]
      : []),
    '---',
  ]
  return `${frontmatter.join('\n')}\n\n${trim(body)}\n`
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
