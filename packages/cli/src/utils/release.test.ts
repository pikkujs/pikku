import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bumpVersion,
  latestChangelogSection,
  parseCommits,
  prependChangelog,
  renderChangelogSection,
  serializeSnapshot,
  setPackageVersion,
  type Commit,
} from './release.js'
import type { SurfaceChanges } from './surface-diff.js'

const commit = (
  subject: string,
  trailers: Record<string, string[]> = {}
): Commit => ({
  sha: 'abcdef1234567890',
  subject,
  trailers,
})

const noChanges: SurfaceChanges = {
  schemaVersion: 1,
  generatedAt: '',
  baseline: 'surface.pikku.json',
  verdict: 'patch',
  summary: { breaking: 0, added: 0, removed: 0, modified: 0 },
  changes: [],
}

describe('bumpVersion', () => {
  test('bumps each level and resets the lower ones', () => {
    assert.equal(bumpVersion('1.4.2', 'patch'), '1.4.3')
    assert.equal(bumpVersion('1.4.2', 'minor'), '1.5.0')
    assert.equal(bumpVersion('1.4.2', 'major'), '2.0.0')
  })

  test('rejects anything but MAJOR.MINOR.PATCH', () => {
    assert.throws(
      () => bumpVersion('1.4.2-rc.1', 'patch'),
      /plain MAJOR\.MINOR\.PATCH/
    )
  })
})

describe('parseCommits', () => {
  test('reads subjects and lower-cased trailers', () => {
    const out =
      'aaa\x1ffix login\x1fRelease: minor\nRelease-Note: Login works on Safari\n\x1d\n' +
      'bbb\x1fchore\x1f\x1d'
    const commits = parseCommits(out)
    assert.equal(commits.length, 2)
    assert.deepEqual(commits[0], {
      sha: 'aaa',
      subject: 'fix login',
      trailers: {
        release: ['minor'],
        'release-note': ['Login works on Safari'],
      },
    })
    assert.deepEqual(commits[1]!.trailers, {})
  })
})

describe('changelog', () => {
  const changes: SurfaceChanges = {
    ...noChanges,
    verdict: 'major',
    changes: [
      {
        kind: 'http',
        id: 'GET /users',
        status: 'removed',
        breaking: true,
        reasons: ['http wiring removed'],
      },
      {
        kind: 'function',
        id: 'createInvoice',
        status: 'added',
        breaking: false,
        reasons: ['function added'],
      },
      {
        kind: 'email',
        id: 'welcome',
        status: 'modified',
        breaking: false,
        reasons: ['email wiring changed'],
      },
    ],
  }

  test('groups surface changes, then notes, then commits', () => {
    const section = renderChangelogSection({
      version: '2.0.0',
      date: '2026-09-28',
      changes,
      commits: [
        commit('drop users route', { 'release-note': ['Use /people instead'] }),
      ],
    })
    assert.equal(
      section,
      [
        '## 2.0.0 (2026-09-28)',
        '',
        '### Breaking',
        '',
        '- `http` `GET /users` — http wiring removed',
        '',
        '### Added',
        '',
        '- `function` `createInvoice` — function added',
        '',
        '### Changed',
        '',
        '- `email` `welcome` — email wiring changed',
        '',
        '### Notes',
        '',
        '- Use /people instead',
        '',
        '### Commits',
        '',
        '- drop users route (abcdef1)',
        '',
      ].join('\n')
    )
  })

  test('prepends under the title, newest first', () => {
    const first = prependChangelog('# Changelog\n', '## 1.0.0 (d)\n\n- a\n')
    const second = prependChangelog(first, '## 1.1.0 (d)\n\n- b\n')
    assert.equal(
      second,
      '# Changelog\n\n## 1.1.0 (d)\n\n- b\n\n## 1.0.0 (d)\n\n- a\n'
    )
    assert.equal(latestChangelogSection(second), '## 1.1.0 (d)\n\n- b')
  })

  test('adds a title to a file without one', () => {
    assert.equal(
      prependChangelog(null, '## 1.0.0 (d)\n'),
      '# Changelog\n\n## 1.0.0 (d)\n'
    )
  })
})

describe('setPackageVersion', () => {
  test('changes only the version value', () => {
    const before =
      '{\n    "name": "app",\n    "version": "1.0.0",\n    "private": true\n}\n'
    assert.equal(
      setPackageVersion(before, '1.1.0'),
      before.replace('1.0.0', '1.1.0')
    )
  })
})

describe('serializeSnapshot', () => {
  test('drops the timestamp and sorts keys so equal surfaces write equal bytes', () => {
    const a = serializeSnapshot({
      schemaVersion: 1,
      generatedAt: '2026-01-01',
      functions: {
        b: {
          key: 'b',
          version: 1,
          inputSchemaName: null,
          outputSchemaName: null,
        },
        a: {
          key: 'a',
          version: 1,
          inputSchemaName: null,
          outputSchemaName: null,
        },
      },
      schemas: {},
      wirings: {},
      publishedVersions: {},
    })
    const b = serializeSnapshot({
      schemaVersion: 1,
      generatedAt: '2027-01-01',
      functions: {
        a: {
          key: 'a',
          version: 1,
          inputSchemaName: null,
          outputSchemaName: null,
        },
        b: {
          key: 'b',
          version: 1,
          inputSchemaName: null,
          outputSchemaName: null,
        },
      },
      schemas: {},
      wirings: {},
      publishedVersions: {},
    })
    assert.equal(a, b)
    assert.ok(!a.includes('generatedAt'))
  })
})
