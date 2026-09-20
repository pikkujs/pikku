import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  checkGuideCoverage,
  featureEvidence,
  guideStep,
  parseGuidePage,
  renderGuidePage,
} from './scenario-guide.js'
import type { GuideFeature } from './scenario-guide.js'

const deployments = (): GuideFeature => ({
  id: 'deployments',
  name: 'Deployments',
  description: 'How deploys are triggered, tracked, and promoted.',
  document: true,
  scenarios: [
    {
      name: 'shipAChangeScenario',
      title: 'Shipping a change',
      description: 'A push becomes a running deployment.',
      steps: [
        guideStep('Given     yasser (the founder) has a project'),
        guideStep('When      yasser pushes a commit'),
        guideStep('Then      yasser sees the deployment go live'),
      ],
      screenshots: [
        {
          id: 'deploy-list',
          name: 'The deployment list',
          path: 'shipping/2.png',
        },
      ],
    },
  ],
})

const plumbing = (): GuideFeature => ({
  id: 'httpWire',
  name: 'HTTP wire',
  document: false,
  scenarios: [],
})

const page = (body = '') =>
  parseGuidePage(
    'product/deployments.md',
    `---\ntitle: Deployments\nfeatures:\n  - id: deployments\n---\n${body}`
  )

describe('guide coverage', () => {
  test('passes when every documented feature is cited', () => {
    const coverage = checkGuideCoverage([deployments()], [page()])
    assert.deepEqual(coverage.missing, [])
    assert.deepEqual(coverage.unknown, [])
    assert.deepEqual(coverage.optedOut, [])
  })

  test('names the feature no page documents', () => {
    const orphan: GuideFeature = {
      ...deployments(),
      id: 'billing',
      name: 'Billing',
    }
    const coverage = checkGuideCoverage([deployments(), orphan], [page()])
    assert.deepEqual(coverage.missing, ['billing'])
  })

  test('a feature with document: false is not a coverage problem', () => {
    const coverage = checkGuideCoverage([deployments(), plumbing()], [page()])
    assert.deepEqual(coverage.missing, [])
  })

  test('a page citing an unregistered feature is an error', () => {
    const coverage = checkGuideCoverage(
      [deployments()],
      [
        parseGuidePage(
          'product/gone.md',
          '---\nfeatures:\n  - id: removedFeature\n---\n'
        ),
      ]
    )
    assert.deepEqual(coverage.unknown, [
      { path: 'product/gone.md', featureId: 'removedFeature' },
    ])
  })

  test('a page citing an opted-out feature is an error', () => {
    const coverage = checkGuideCoverage(
      [plumbing()],
      [
        parseGuidePage(
          'product/wire.md',
          '---\nfeatures:\n  - id: httpWire\n---\n'
        ),
      ]
    )
    assert.deepEqual(coverage.optedOut, [
      { path: 'product/wire.md', featureId: 'httpWire' },
    ])
  })

  test('declared evidence that is no longer current is reported stale', () => {
    const source = parseGuidePage(
      'product/deployments.md',
      '---\nfeatures:\n  - id: deployments\n    evidence: "abc1234"\n---\n'
    )
    const coverage = checkGuideCoverage([deployments()], [source])
    assert.equal(coverage.stale.length, 1)
    assert.equal(coverage.stale[0]!.declared, 'abc1234')
    assert.equal(coverage.stale[0]!.current, featureEvidence(deployments()))
  })
})

describe('evidence', () => {
  test('an inserted step changes it', () => {
    const feature = deployments()
    const changed = deployments()
    changed.scenarios[0]!.steps.splice(
      1,
      0,
      guideStep('When yasser opens the project')
    )
    assert.notEqual(featureEvidence(feature), featureEvidence(changed))
  })

  test('the images being re-taken does not', () => {
    const feature = deployments()
    const restyled = deployments()
    restyled.scenarios[0]!.screenshots[0]!.path = 'shipping/7.png'
    assert.equal(featureEvidence(feature), featureEvidence(restyled))
  })

  test('the order artifacts were filed in does not', () => {
    const feature = deployments()
    feature.scenarios[0]!.screenshots = [
      { id: 'a', path: 'shipping/1.png' },
      { id: 'b', path: 'shipping/2.png' },
    ]
    const reordered = deployments()
    reordered.scenarios[0]!.screenshots = [
      { id: 'b', path: 'shipping/2.png' },
      { id: 'a', path: 'shipping/1.png' },
    ]
    assert.equal(featureEvidence(feature), featureEvidence(reordered))
  })
})

describe('emit', () => {
  const features = () => new Map([['deployments', deployments()]])

  test('the generated block carries the steps and the screenshots', () => {
    const markdown = renderGuidePage(page(), features(), '../runs/abc/')
    assert.match(markdown, /^---\ntitle: "Deployments"\n/)
    assert.match(markdown, /## Shipping a change/)
    assert.match(
      markdown,
      /1\. \*\*Given\*\* yasser \(the founder\) has a project/
    )
    assert.match(
      markdown,
      /3\. \*\*Then\*\* yasser sees the deployment go live/
    )
    assert.match(
      markdown,
      /!\[The deployment list\]\(\.\.\/runs\/abc\/shipping\/2\.png\)/
    )
  })

  test('the description falls back to the feature when the page states none', () => {
    const markdown = renderGuidePage(page(), features(), '')
    assert.match(
      markdown,
      /description: "How deploys are triggered, tracked, and promoted\."/
    )
  })

  test('identical inputs produce byte-identical output', () => {
    assert.equal(
      renderGuidePage(page('Prose.\n'), features(), '../runs/abc/'),
      renderGuidePage(page('Prose.\n'), features(), '../runs/abc/')
    )
  })

  test('hand-written prose survives a rebuild', () => {
    const first = renderGuidePage(
      page('Deploys are how work reaches users.\n'),
      features(),
      ''
    )
    const rebuilt = renderGuidePage(
      parseGuidePage('product/deployments.md', first),
      features(),
      ''
    )
    assert.match(rebuilt, /Deploys are how work reaches users\./)
    assert.equal(rebuilt, first)
  })

  test('a rebuild rewrites only the generated region', () => {
    const first = renderGuidePage(page('Before.\n'), features(), '')
    const edited = first.replace('Before.', 'Before, rewritten by hand.')
    const moved = deployments()
    moved.scenarios[0]!.steps.push(
      guideStep('Then yasser sees the release recorded')
    )
    const rebuilt = renderGuidePage(
      parseGuidePage('product/deployments.md', edited),
      new Map([['deployments', moved]]),
      ''
    )
    assert.match(rebuilt, /Before, rewritten by hand\./)
    assert.match(rebuilt, /4\. \*\*Then\*\* yasser sees the release recorded/)
  })

  test('a block whose feature the page no longer cites is dropped', () => {
    const built = renderGuidePage(page('Prose.\n'), features(), '')
    const uncited = parseGuidePage(
      'product/deployments.md',
      built.replace('  - id: deployments', '  - id: other')
    )
    const rebuilt = renderGuidePage(uncited, new Map(), '')
    assert.doesNotMatch(rebuilt, /pikku:guide/)
    assert.match(rebuilt, /Prose\./)
  })
})

describe('parsing', () => {
  test('a source with no frontmatter is refused by name', () => {
    assert.throws(
      () => parseGuidePage('product/loose.md', '# Deployments\n'),
      /product\/loose\.md has no frontmatter/
    )
  })

  test('a bare feature id is the shorthand for one with no evidence', () => {
    const parsed = parseGuidePage(
      'product/deployments.md',
      '---\nfeatures:\n  - deployments\n---\n'
    )
    assert.deepEqual(parsed.features, [{ id: 'deployments' }])
  })
})

describe('steps', () => {
  test('the phase is read back off the recorded sentence', () => {
    assert.deepEqual(guideStep('Given     yasser signs in'), {
      phase: 'Given',
      sentence: 'yasser signs in',
    })
  })

  test('a sentence with no keyword keeps its words', () => {
    assert.deepEqual(guideStep('  some step  '), { sentence: 'some step' })
  })
})
