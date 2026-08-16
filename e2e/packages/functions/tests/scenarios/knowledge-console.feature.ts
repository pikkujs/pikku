/**
 * The console's Knowledge page, read against this project's own `knowledge/`
 * bundle.
 *
 * The fixture is real: `e2e/knowledge/` is the harness's knowledge base, and the
 * page reads it off disk on every request. That makes note paths the one thing
 * safe to select on — a path is the note's identity, declared by where the file
 * sits, and it is neither translated nor generated. Everything else on the page is
 * console copy, so no scenario here matches a label.
 *
 * Nothing mutates. The page is read-only by design — a note is edited in the repo,
 * in the same commit as the code it describes — so these scenarios need no
 * teardown, and a suite that cannot write is the strongest statement that the
 * console is not a second source of truth for a committed file.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const KNOWLEDGE_PAGE = '/console/knowledge'
const NAVIGATOR_READY = { testId: 'knowledge-navigator' }

const SLICE = 'knowledge/slices/01-read-a-report.md'
const DECISION =
  'knowledge/decisions/security/only-report-viewers-read-a-report.md'

const navRow = (path: string) => ({ testId: `knowledge-nav-${path}` })
const document = (path: string) => ({ testId: `knowledge-document-${path}` })

export const knowledgeListsEveryNoteScenario = pikkuScenario<
  void,
  { listed: true }
>({
  title: 'The navigator lists the notes on disk',
  description:
    'Every note in the bundle appears in the navigator, grouped by the section it lives in',
  tags: ['scenario', 'knowledge-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'knowledgeListsEveryNoteScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the knowledge page',
      'opensConsolePage',
      { path: KNOWLEDGE_PAGE, waitFor: NAVIGATOR_READY },
      { actor: actors.admin }
    )
    // At least one row per note the bundle is guaranteed to hold. An exact count
    // would fail the next time somebody writes a note, which is a thing this
    // project wants people to do.
    await scenario.then(
      'sees a row for every note',
      'seesTestId',
      { testId: 'knowledge-nav-knowledge/', prefix: true, atLeast: 6 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the slice about reading a report',
      'seesTestId',
      navRow(SLICE),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the security decision behind it',
      'seesTestId',
      navRow(DECISION),
      { actor: actors.admin }
    )

    return { listed: true }
  },
})

export const knowledgeOpensASliceScenario = pikkuScenario<
  void,
  { opened: true }
>({
  title: 'Opening a slice shows its scenario',
  description:
    'The document view renders the note body, including the gherkin block that proves the slice',
  tags: ['scenario', 'knowledge-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'knowledgeOpensASliceScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the knowledge page',
      'opensConsolePage',
      { path: KNOWLEDGE_PAGE, waitFor: NAVIGATOR_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the slice about reading a report',
      'clicksTestId',
      navRow(SLICE),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the note as a document',
      'seesTestId',
      document(SLICE),
      { actor: actors.admin }
    )
    // The note's own words, from the gherkin block. It is the note's content and
    // not the console's, which is why matching text is safe here.
    await scenario.then(
      'sees the scenario that proves the slice',
      'seesText',
      { text: 'Given guest holds the report-viewer role' },
      { actor: actors.admin }
    )

    return { opened: true }
  },
})

export const knowledgeFollowsALinkScenario = pikkuScenario<
  void,
  { followed: true }
>({
  title: 'A link between notes stays inside the console',
  description:
    'A markdown link that resolves to another note opens that note rather than leaving the page',
  tags: ['scenario', 'knowledge-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'knowledgeFollowsALinkScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the knowledge page',
      'opensConsolePage',
      { path: KNOWLEDGE_PAGE, waitFor: NAVIGATOR_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the slice about reading a report',
      'clicksTestId',
      navRow(SLICE),
      { actor: actors.admin }
    )
    await scenario.then('sees the slice', 'seesTestId', document(SLICE), {
      actor: actors.admin,
    })
    // The slice links out to the decision it is governed by. Following it must
    // resolve the relative path against the linking note's directory.
    await scenario.when(
      'follows the link to the decision',
      'clicksLink',
      { name: 'only report-viewers read a report' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the decision as a document',
      'seesTestId',
      document(DECISION),
      { actor: actors.admin }
    )
    await scenario.then(
      'stays on the knowledge page',
      'expectsUrl',
      { contains: KNOWLEDGE_PAGE },
      { actor: actors.admin }
    )

    return { followed: true }
  },
})

export const knowledgeReportsNoIssuesScenario = pikkuScenario<
  void,
  { clean: true }
>({
  title: 'A consistent base reports nothing to fix',
  description:
    'The page and `pikku knowledge validate` agree: with no errors or warnings, no issues row is offered',
  tags: ['scenario', 'knowledge-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'knowledgeReportsNoIssuesScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the knowledge page',
      'opensConsolePage',
      { path: KNOWLEDGE_PAGE, waitFor: NAVIGATOR_READY },
      { actor: actors.admin }
    )
    // This project's bundle is kept clean by the same check CI runs, so the
    // findings row must be absent. If it appears, the base drifted — which is
    // exactly what this scenario is for.
    await scenario.then(
      'is offered no issues to fix',
      'doesNotSeeTestId',
      { testId: 'knowledge-nav-findings' },
      { actor: actors.admin }
    )

    return { clean: true }
  },
})

export const knowledgeOpensTheDetailsScenario = pikkuScenario<
  void,
  { opened: true }
>({
  title: 'A note’s frontmatter is there when asked for',
  description:
    'The details a note declares — its entities, its resources, its edges — are folded away until the reader opens them',
  tags: ['scenario', 'knowledge-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'knowledgeOpensTheDetailsScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the knowledge page',
      'opensConsolePage',
      { path: KNOWLEDGE_PAGE, waitFor: NAVIGATOR_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the slice about reading a report',
      'clicksTestId',
      navRow(SLICE),
      { actor: actors.admin }
    )
    // Folded by default: a note has more frontmatter than prose in the small
    // cases, and a header that fills the screen buries what the note was written
    // to say.
    await scenario.then(
      'is shown the note, not its filing',
      'doesNotSeeTestId',
      { testId: 'knowledge-note-details' },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for the details',
      'clicksTestId',
      { testId: 'knowledge-note-details-toggle' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees them',
      'seesTestId',
      { testId: 'knowledge-note-details' },
      { actor: actors.admin }
    )
    // The note's own frontmatter, and a resource kind that only resolves because
    // the scope is declared in the code this note is about.
    await scenario.then(
      'sees the scope the slice is gated on',
      'seesText',
      { text: 'scope:reports:read' },
      { actor: actors.admin }
    )

    return { opened: true }
  },
})

export const knowledgeDrawsADiagramScenario = pikkuScenario<
  void,
  { drawn: true }
>({
  title: 'A diagram in a note is drawn',
  description:
    'A ```mermaid fence renders as a diagram rather than as the source somebody typed',
  tags: ['scenario', 'knowledge-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'knowledgeDrawsADiagramScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the knowledge page',
      'opensConsolePage',
      { path: KNOWLEDGE_PAGE, waitFor: NAVIGATOR_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the slice with a diagram in it',
      'clicksTestId',
      navRow(SLICE),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the gate as a drawing',
      'seesTestId',
      { testId: 'mermaid-diagram' },
      { actor: actors.admin }
    )
    // Text out of the fence, which exists on the page only once mermaid has laid
    // the diagram out — the source is a decision node reading `reports:read?`.
    // Mermaid is loaded on demand, so this is also what proves the lazy import
    // arrives.
    await scenario.then(
      'sees the question the gate asks',
      'seesText',
      { text: 'reports:read?' },
      { actor: actors.admin }
    )

    return { drawn: true }
  },
})

export const knowledgeConsoleFeature = pikkuFeature({
  name: 'Knowledge Console',
  description: "Reading the project's knowledge notes in the console",
  tags: ['knowledge-console', 'console'],
  scenarios: [
    knowledgeListsEveryNoteScenario,
    knowledgeOpensASliceScenario,
    knowledgeFollowsALinkScenario,
    knowledgeReportsNoIssuesScenario,
    knowledgeOpensTheDetailsScenario,
    knowledgeDrawsADiagramScenario,
  ],
})
