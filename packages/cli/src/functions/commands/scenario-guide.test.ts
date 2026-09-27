import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  checkGuideCoverage,
  featureEvidence,
  guideStep,
  parseGuideLock,
  parseGuidePage,
  renderGuideLock,
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

const cite = (id: string) =>
  `<!-- pikku:guide feature=${id} -->\n<!-- /pikku:guide -->`

const page = (body = '') =>
  parseGuidePage(
    'product/deployments.md',
    `---\ntitle: Deployments\n---\n${body}\n${cite('deployments')}\n`
  )

describe('guide coverage', () => {
  test('passes when every documented feature is cited', () => {
    const coverage = checkGuideCoverage([deployments()], [page()])
    assert.deepEqual(coverage.missing, [])
    assert.deepEqual(coverage.unknown, [])
    assert.deepEqual(coverage.optedOut, [])
  })

  test('names the feature no page cites', () => {
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
          `---\ntitle: Gone\n---\n${cite('removedFeature')}\n`
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
          `---\ntitle: Wire\n---\n${cite('httpWire')}\n`
        ),
      ]
    )
    assert.deepEqual(coverage.optedOut, [
      { path: 'product/wire.md', featureId: 'httpWire' },
    ])
  })

  test('locked evidence that is no longer current is reported stale', () => {
    const coverage = checkGuideCoverage([deployments()], [page()], {
      deployments: 'abc1234',
    })
    assert.equal(coverage.stale.length, 1)
    assert.equal(coverage.stale[0]!.locked, 'abc1234')
    assert.equal(coverage.stale[0]!.current, featureEvidence(deployments()))
  })

  test('a feature the lock has never seen is not stale', () => {
    const coverage = checkGuideCoverage([deployments()], [page()], {})
    assert.deepEqual(coverage.stale, [])
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

describe('data-driven scenarios', () => {
  test('a row repeated with the same shots contributes one figure each', () => {
    const feature = deployments()
    const row = feature.scenarios[0]!
    feature.scenarios = [row, { ...row }]
    const rendered = renderGuidePage(page(), new Map([[feature.id, feature]]), '')
    for (const shot of row.screenshots) {
      assert.equal(rendered.split(shot.path).length - 1, 1)
    }
  })

  test('figures from every row reach the block', () => {
    const feature = deployments()
    const row = feature.scenarios[0]!
    feature.scenarios = [
      row,
      { ...row, screenshots: [{ id: 'z', path: 'shipping/9.png' }] },
    ]
    const rendered = renderGuidePage(page(), new Map([[feature.id, feature]]), '')
    assert.ok(rendered.includes('shipping/9.png'))
    for (const shot of row.screenshots) {
      assert.ok(rendered.includes(shot.path))
    }
  })
})

describe('a citation that shows nothing', () => {
  test('a cited feature whose run filed no figure is named', () => {
    const feature = deployments()
    for (const scenario of feature.scenarios) {
      scenario.screenshots = []
    }
    const coverage = checkGuideCoverage([feature], [page()])
    assert.deepEqual(coverage.figureless, [
      { path: 'product/deployments.md', featureId: 'deployments' },
    ])
  })

  test('a feature with a figure is not named', () => {
    const coverage = checkGuideCoverage([deployments()], [page()])
    assert.deepEqual(coverage.figureless, [])
  })
})

describe('lock', () => {
  test('it holds the evidence of every documented feature', () => {
    const lock = parseGuideLock(
      renderGuideLock([deployments(), plumbing()], ['deployments', 'plumbing'])
    )
    assert.deepEqual(lock, { deployments: featureEvidence(deployments()) })
  })

  test('a feature no page cites yet is left out', () => {
    const billing: GuideFeature = {
      ...deployments(),
      id: 'billing',
      name: 'Billing',
      scenarios: [],
    }
    const lock = parseGuideLock(
      renderGuideLock([deployments(), billing], ['deployments'])
    )
    assert.deepEqual(Object.keys(lock), ['deployments'])
  })

  test('the first build of a page is never reported as stale', () => {
    const billing: GuideFeature = {
      ...deployments(),
      id: 'billing',
      name: 'Billing',
      scenarios: [],
    }
    const features = [deployments(), billing]
    const lock = parseGuideLock(
      renderGuideLock(features, ['deployments'])
    )
    const withBilling = checkGuideCoverage(
      features,
      [page(cite('billing'))],
      lock
    )
    assert.deepEqual(withBilling.stale, [])
  })

  test('it is keyed in a stable order', () => {
    const billing: GuideFeature = {
      ...deployments(),
      id: 'billing',
      name: 'Billing',
    }
    assert.equal(
      renderGuideLock([deployments(), billing], ['deployments', 'billing']),
      renderGuideLock([billing, deployments()], ['billing', 'deployments'])
    )
  })

  test('an unreadable lock is refused rather than treated as empty', () => {
    assert.throws(() => parseGuideLock('not json'), /unreadable/)
    assert.throws(() => parseGuideLock('[]'), /not an object/)
  })
})

describe('emit', () => {
  const features = () => new Map([['deployments', deployments()]])

  test('the generated block carries the figures and nothing else', () => {
    const markdown = renderGuidePage(page(), features(), '../runs/abc/')
    assert.match(markdown, /^---\ntitle: Deployments\n/)
    assert.match(
      markdown,
      /!\[The deployment list\]\(\.\.\/runs\/abc\/shipping\/2\.png\)/
    )
  })

  test('a recording leads the stills it is made of', () => {
    const feature = deployments()
    feature.scenarios[0]!.videos = [
      { id: 'deploy-film', path: 'shipping/run.webm' },
    ]
    const markdown = renderGuidePage(
      page(),
      new Map([['deployments', feature]]),
      '/docs/_media/'
    )
    const film = markdown.indexOf('/docs/_media/shipping/run.webm')
    const still = markdown.indexOf('/docs/_media/shipping/2.png')
    assert.ok(film > -1 && still > -1)
    assert.ok(film < still)
  })

  test("a recording is a figure, so the page stays free of HTML", () => {
    const feature = deployments()
    feature.scenarios[0]!.videos = [
      { id: 'deploy-film', actor: 'yasser', path: 'shipping/run.webm' },
    ]
    const markdown = renderGuidePage(
      page(),
      new Map([['deployments', feature]]),
      ''
    )
    assert.match(markdown, /!\[Shipping a change — yasser\]\(shipping\/run\.webm\)/)
    assert.doesNotMatch(markdown, /<video|<details/)
  })

  test('a feature with only a recording is not figureless', () => {
    const feature = deployments()
    feature.scenarios[0]!.screenshots = []
    feature.scenarios[0]!.videos = [{ path: 'shipping/run.webm' }]
    const coverage = checkGuideCoverage([feature], [page()])
    assert.deepEqual(coverage.figureless, [])
  })

  test('the scenario title and description are evidence, not content', () => {
    const feature = deployments()
    const markdown = renderGuidePage(page(), features(), '')
    assert.doesNotMatch(markdown, /## Shipping a change/)
    assert.ok(!markdown.includes(feature.scenarios[0]!.description!))
  })

  test('the steps are evidence, not content', () => {
    const markdown = renderGuidePage(page(), features(), '')
    assert.doesNotMatch(markdown, /\*\*Given\*\*/)
    assert.doesNotMatch(markdown, /yasser pushes a commit/)
  })

  test('the marker carries the feature id and nothing else', () => {
    const markdown = renderGuidePage(page(), features(), '')
    assert.match(markdown, /<!-- pikku:guide feature=deployments -->/)
    assert.doesNotMatch(markdown, /evidence=/)
  })

  test('the block lands where the author left the markers', () => {
    const source = parseGuidePage(
      'product/deployments.md',
      `---\ntitle: Deployments\n---\nBefore.\n\n${cite('deployments')}\n\n## After\n\nTail.\n`
    )
    const markdown = renderGuidePage(source, features(), '')
    assert.ok(
      markdown.indexOf('Before.') < markdown.indexOf('shipping/2.png') &&
        markdown.indexOf('shipping/2.png') < markdown.indexOf('## After')
    )
  })

  test('the description falls back to the feature when the page states none', () => {
    const markdown = renderGuidePage(page(), features(), '')
    assert.match(
      markdown,
      /description: How deploys are triggered, tracked, and promoted\./
    )
  })

  test('frontmatter the compiler does not own survives a rebuild', () => {
    const source = parseGuidePage(
      'product/deployments.md',
      `---\ntitle: Deployments\nslug: /deploying\nsidebar_position: 3\ndraft: false\n---\n${cite('deployments')}\n`
    )
    const markdown = renderGuidePage(source, features(), '')
    assert.match(markdown, /slug: \/deploying/)
    assert.match(markdown, /sidebar_position: 3/)
    assert.match(markdown, /draft: false/)
    assert.equal(
      renderGuidePage(parseGuidePage('product/deployments.md', markdown), features(), ''),
      markdown
    )
  })

  test('a long frontmatter value is not folded across lines', () => {
    const description =
      'The conversation you build in \u2014 it decides, writes it down, and puts the builders to work.'
    const source = `---\ntitle: Chat\ndescription: ${description}\n---\n\nProse.\n`
    const rendered = renderGuidePage(
      parseGuidePage('building/chat.md', source),
      new Map(),
      ''
    )
    assert.equal(rendered, source)
  })

  test('a CRLF source is read as having frontmatter', () => {
    const parsed = parseGuidePage(
      'product/deployments.md',
      `---\r\ntitle: Deployments\r\n---\r\n${cite('deployments')}\r\n`
    )
    assert.equal(parsed.title, 'Deployments')
    assert.deepEqual(parsed.features, ['deployments'])
  })

  test('identical inputs produce byte-identical output', () => {
    assert.equal(
      renderGuidePage(page('Prose.'), features(), '../runs/abc/'),
      renderGuidePage(page('Prose.'), features(), '../runs/abc/')
    )
  })

  test('hand-written prose survives a rebuild', () => {
    const first = renderGuidePage(
      page('Deploys are how work reaches users.'),
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

  test('a guide built before the hash moved into the lock rebuilds clean', () => {
    const legacy = parseGuidePage(
      'product/deployments.md',
      `---\ntitle: Deployments\n---\nBefore.\n\n<!-- pikku:guide feature=deployments evidence=abc1234 -->\nstale\n<!-- /pikku:guide -->\n`
    )
    assert.deepEqual(legacy.features, ['deployments'])
    const rebuilt = renderGuidePage(legacy, features(), '')
    assert.doesNotMatch(rebuilt, /evidence=/)
    assert.doesNotMatch(rebuilt, /stale/)
    assert.match(rebuilt, /shipping\/2\.png/)
  })

  test('a rebuild rewrites only the generated region', () => {
    const first = renderGuidePage(page('Before.'), features(), '')
    const edited = first.replace('Before.', 'Before, rewritten by hand.')
    const reshot = deployments()
    reshot.scenarios[0]!.screenshots = [{ id: 'a', path: 'shipping/7.png' }]
    const rebuilt = renderGuidePage(
      parseGuidePage('product/deployments.md', edited),
      new Map([['deployments', reshot]]),
      ''
    )
    assert.match(rebuilt, /Before, rewritten by hand\./)
    assert.match(rebuilt, /shipping\/7\.png/)
  })

  test('a block whose feature the page no longer cites is dropped', () => {
    const built = renderGuidePage(page('Prose.'), features(), '')
    const uncited = parseGuidePage(
      'product/deployments.md',
      built.replace('feature=deployments', 'feature=other')
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

  test('a page citing nothing cites nothing', () => {
    const parsed = parseGuidePage(
      'product/prose.md',
      '---\ntitle: Prose\n---\nJust words.\n'
    )
    assert.deepEqual(parsed.features, [])
  })

  test('a feature cited twice is counted once', () => {
    const parsed = parseGuidePage(
      'product/deployments.md',
      `---\ntitle: Deployments\n---\n${cite('deployments')}\n\n${cite('deployments')}\n`
    )
    assert.deepEqual(parsed.features, ['deployments'])
  })

  test('the old frontmatter list is refused with the marker to write instead', () => {
    assert.throws(
      () =>
        parseGuidePage(
          'product/deployments.md',
          '---\ntitle: Deployments\nfeatures:\n  - deployments\n---\n'
        ),
      /pikku:guide feature=<id>/
    )
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
