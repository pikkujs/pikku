import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXAMPLES } from '../../examples.gen.js'
import {
  entityNames,
  extractTeaching,
  renameActorsInCode,
  renameEntityInCode,
  renameEntityInPath,
  requiredChain,
  reservedEntityCollision,
  resolveExamplePath,
  splitExampleFiles,
  stripTeaching,
} from './corpus.js'
import { entityWriteCoverage, personaCast, resolveAppBase } from './project.js'
import { runExamplesAdd, runExamplesList, runExamplesShow } from './run.js'

const project = (files: Record<string, string>) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-examples-'))
  for (const [path, body] of Object.entries(files)) {
    const full = join(rootDir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return {
    rootDir,
    outDir: join(rootDir, '.pikku'),
    srcDirectories: [join(rootDir, 'src')],
  }
}

describe('the corpus', () => {
  test('every example declares a name, a title and what it is for', () => {
    assert.ok(EXAMPLES.length > 0)
    for (const example of EXAMPLES) {
      assert.ok(example.name, `${example.source} has no name`)
      assert.ok(example.title, `${example.name} has no title`)
      assert.ok(example.when, `${example.name} does not say when to use it`)
    }
  })

  test('nothing in the corpus reaches for a package outside this repo', () => {
    for (const example of EXAMPLES) {
      assert.ok(
        !/@pikkufabric\//.test(example.content),
        `${example.name} imports a fabric package`
      )
    }
  })

  test('every required example exists', () => {
    const names = new Set(EXAMPLES.map((e) => e.name))
    for (const example of EXAMPLES) {
      for (const required of example.requires) {
        assert.ok(
          names.has(required),
          `${example.name} requires missing ${required}`
        )
      }
    }
  })
})

describe('stripping the teaching', () => {
  test('a line that is only a teaching comment is dropped, a trailing one is trimmed', () => {
    const code = stripTeaching(
      [
        '//~ name: thing',
        'const a = 1',
        '//~ explaining',
        'const b = 2 //~ why',
      ].join('\n')
    )
    assert.equal(code, 'const a = 1\nconst b = 2\n')
  })

  test('nothing a recipe writes carries a teaching comment', () => {
    for (const example of EXAMPLES) {
      for (const file of splitExampleFiles(stripTeaching(example.content))) {
        assert.ok(
          !file.body.includes('//~'),
          `${example.name} leaks teaching into ${file.path}`
        )
      }
    }
  })

  test('teaching comes back anchored to the line it was written against', () => {
    const notes = extractTeaching(
      [
        '//~ name: thing',
        'const zero = 0',
        '//~ opening',
        'const a = 1',
        '//~ about b',
        'const b = 2',
      ].join('\n')
    )
    assert.deepEqual(
      notes.map((n) => [n.anchor, n.lines.join(' ')]),
      [
        ['const a = 1', 'opening'],
        ['const b = 2', 'about b'],
      ]
    )
  })
})

describe('renaming onto a real entity', () => {
  test('one declared example yields all three spellings', () => {
    assert.deepEqual(entityNames('session_note'), {
      camel: 'sessionNote',
      pascal: 'SessionNote',
      kebab: 'session-note',
    })
    assert.deepEqual(entityNames('SessionNote'), entityNames('session-note'))
  })

  test('code takes the identifier spelling and a path takes the hyphenated one', () => {
    const from = entityNames('todo')
    const to = entityNames('session-note')
    assert.equal(
      renameEntityInCode("listTodos(TodoZ, 'todo')", from, to),
      "listSessionNotes(SessionNoteZ, 'sessionNote')"
    )
    assert.equal(
      renameEntityInPath('src/functions/list-todos.function.ts', from, to),
      'src/functions/list-session-notes.function.ts'
    )
  })

  test('a name the stack already owns is refused rather than rewritten', () => {
    assert.ok(reservedEntityCollision('session'))
    assert.ok(reservedEntityCollision('User'))
    assert.equal(reservedEntityCollision('clientVisit'), null)
  })

  test("an example's actors are pointed at people this project declares", () => {
    const code =
      "scenario.do(actors.mechanic, 'x'); scenario.do(actors.clerk, 'y')"
    assert.equal(
      renameActorsInCode(code, ['owner', 'staff']),
      "scenario.do(actors.owner, 'x'); scenario.do(actors.staff, 'y')"
    )
  })

  test('a cast smaller than the example saturates on the last person', () => {
    const code = 'actors.a actors.b actors.c'
    assert.equal(
      renameActorsInCode(code, ['solo']),
      'actors.solo actors.solo actors.solo'
    )
  })

  test('an actor the project already declares is left alone', () => {
    assert.equal(
      renameActorsInCode('actors.owner', ['owner', 'staff']),
      'actors.owner'
    )
  })
})

describe('where a file lands', () => {
  test("a frontend path is app-relative and a backend path follows the project's source dir", () => {
    assert.equal(
      resolveExamplePath('src/pages/Jobs.tsx', 'apps/app', 'src'),
      'apps/app/src/pages/Jobs.tsx'
    )
    assert.equal(
      resolveExamplePath(
        'packages/functions/src/functions/x.function.ts',
        'apps/app',
        'src'
      ),
      'src/functions/x.function.ts'
    )
    assert.equal(
      resolveExamplePath(
        'packages/functions/src/functions/x.function.ts',
        'apps/app',
        'packages/functions/src'
      ),
      'packages/functions/src/functions/x.function.ts'
    )
    assert.equal(
      resolveExamplePath('db/sqlite/0005-x.sql', 'apps/app', 'src'),
      'db/sqlite/0005-x.sql'
    )
  })

  test('a project with no apps/ writes frontend files at its root', () => {
    const { rootDir } = project({ 'src/index.ts': '' })
    assert.deepEqual(resolveAppBase(rootDir), { slug: '.', base: '.' })
    assert.equal(resolveAppBase(rootDir, 'storefront'), null)
  })

  test('an app is only an app when it has a package.json', () => {
    const { rootDir } = project({
      'apps/app/package.json': '{}',
      'apps/husk/README.md': '',
    })
    assert.deepEqual(resolveAppBase(rootDir), { slug: 'app', base: 'apps/app' })
    assert.equal(resolveAppBase(rootDir, 'husk'), null)
  })
})

describe('what has to be written first', () => {
  test('dependencies come back deps-first, and one carrying an example entity is manual', () => {
    const entries = [
      { name: 'page', requires: ['panel'], entity: '' },
      { name: 'panel', requires: ['table'], entity: '' },
      { name: 'table', requires: [], entity: '' },
      { name: 'rows', requires: [], entity: 'todo' },
    ] as any
    assert.deepEqual(requiredChain('page', entries), {
      install: ['table', 'panel'],
      manual: [],
      missing: [],
    })
    entries[0].requires.push('rows')
    assert.deepEqual(requiredChain('page', entries).manual, ['rows'])
  })

  test('a cycle terminates rather than recursing forever', () => {
    const entries = [
      { name: 'a', requires: ['b'], entity: '' },
      { name: 'b', requires: ['a'], entity: '' },
    ] as any
    assert.deepEqual(requiredChain('a', entries).install, ['b'])
  })
})

describe('reading the project', () => {
  test('the persona cast comes from definePersonas, in declaration order', () => {
    const { srcDirectories } = project({
      'src/personas.virtual-user.ts': [
        'definePersonas({',
        '  dispatcher: { name: "Dispatcher", roles: ["staff"] },',
        '  technician: { name: "Technician", roles: ["staff"] },',
        '})',
      ].join('\n'),
    })
    assert.deepEqual(personaCast(srcDirectories), ['dispatcher', 'technician'])
  })

  test('a framework-declared table is not something a person has to be able to edit', () => {
    const { rootDir, srcDirectories } = project({
      'db/sqlite/0001-auth.sql':
        '-- Generated by `pikku db generate` from better-auth.\nCREATE TABLE session (id TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id));',
      'db/sqlite/0002-app.sql':
        'CREATE TABLE job (id TEXT PRIMARY KEY, title TEXT NOT NULL, site_id TEXT REFERENCES site(id));',
      'src/x.ts': '',
    })
    assert.deepEqual(entityWriteCoverage(rootDir, srcDirectories), {
      required: ['job'],
      uncovered: ['job'],
    })
  })

  test('a table with a write path is covered, snake_case or camel', () => {
    const { rootDir, srcDirectories } = project({
      'db/sqlite/0001-app.sql':
        'CREATE TABLE service_visit (id TEXT PRIMARY KEY, note TEXT, job_id TEXT REFERENCES job(id));',
      'src/create.function.ts': "kysely.insertInto('serviceVisit').values(x)",
    })
    assert.deepEqual(entityWriteCoverage(rootDir, srcDirectories).uncovered, [])
  })

  test('a junction table and a lookup table are neither of them promises to a user', () => {
    const { rootDir, srcDirectories } = project({
      'db/sqlite/0001-app.sql': [
        'CREATE TABLE job_tag (job_id TEXT REFERENCES job(id), tag_id TEXT REFERENCES tag(id), PRIMARY KEY (job_id, tag_id));',
        'CREATE TABLE status (id TEXT PRIMARY KEY, label TEXT, color TEXT);',
      ].join('\n'),
      'src/x.ts': '',
    })
    assert.deepEqual(entityWriteCoverage(rootDir, srcDirectories).required, [])
  })
})

describe('pikku examples', () => {
  test('list names every example, and a group narrows it', () => {
    assert.equal(runExamplesList().examples.length, EXAMPLES.length)
    const scenarios = runExamplesList('scenario').examples
    assert.ok(scenarios.length > 0)
    assert.ok(scenarios.every((e) => e.name.startsWith('scenario')))
  })

  test('show prints the code with the teaching beside it, not in it', () => {
    const p = project({ 'src/x.ts': '' })
    const shown = runExamplesShow(p, 'list-query', 'invoice')
    assert.equal(shown.found, true)
    assert.ok(!shown.code.includes('//~'))
    assert.ok(shown.code.includes('Invoice'))
    assert.ok(!shown.code.includes('Todo'))
    assert.ok(shown.notes.length > 0)
  })

  test('show says what is available rather than throwing', () => {
    const shown = runExamplesShow(project({}), 'nope')
    assert.equal(shown.found, false)
    assert.ok(shown.available.includes('list-query'))
  })

  test('add writes the files, already named for the entity', () => {
    const p = project({
      'apps/app/package.json': '{}',
      'db/sqlite/0001-app.sql':
        'CREATE TABLE invoice (id TEXT PRIMARY KEY, total INTEGER);',
      'src/create-invoice.function.ts':
        "kysely.insertInto('invoice').values(x)",
    })
    const result = runExamplesAdd(p, 'list-query', 'invoice')
    assert.equal(result.refusal, '')
    assert.ok(result.written.length > 0)
    for (const path of result.written) {
      assert.ok(existsSync(join(p.rootDir, path)))
      const body = readFileSync(join(p.rootDir, path), 'utf-8')
      assert.ok(!body.includes('//~'))
      assert.ok(!body.includes('Todo'))
    }
  })

  test('a second add keeps what is already there rather than clobbering it', () => {
    const p = project({ 'apps/app/package.json': '{}' })
    const first = runExamplesAdd(p, 'list-query', 'invoice')
    writeFileSync(join(p.rootDir, first.written[0]!), 'mine\n')
    const second = runExamplesAdd(p, 'list-query', 'invoice')
    assert.deepEqual(second.written, [])
    assert.ok(second.kept.includes(first.written[0]!))
    assert.equal(
      readFileSync(join(p.rootDir, first.written[0]!), 'utf-8'),
      'mine\n'
    )
  })

  test('an example written for an example domain refuses to land unrenamed', () => {
    const result = runExamplesAdd(project({}), 'list-query')
    assert.match(result.refusal, /--entity/)
    assert.deepEqual(result.written, [])
  })

  test('a reserved entity is refused with what it would collide with', () => {
    const result = runExamplesAdd(project({}), 'list-query', 'session')
    assert.match(result.refusal, /Better Auth/)
  })

  test('an example with no destination is read, not written', () => {
    const result = runExamplesAdd(project({}), 'auth-session')
    assert.match(result.refusal, /pikku examples show/)
  })

  test('deferUntil holds an AI surface back until one entity can be created', () => {
    const blocked = project({
      'db/sqlite/0001-app.sql':
        'CREATE TABLE job (id TEXT PRIMARY KEY, title TEXT, site_id TEXT REFERENCES site(id));',
      'src/list.function.ts': "kysely.selectFrom('job')",
    })
    assert.match(
      runExamplesAdd(blocked, 'ai-agent', 'helper').refusal,
      /entity-write/
    )

    const ready = project({
      'apps/app/package.json': '{}',
      'db/sqlite/0001-app.sql':
        'CREATE TABLE job (id TEXT PRIMARY KEY, title TEXT, site_id TEXT REFERENCES site(id));',
      'src/create.function.ts': "kysely.insertInto('job').values(x)",
    })
    assert.equal(runExamplesAdd(ready, 'ai-agent', 'helper').refusal, '')
  })

  test('a project with no schema at all is not paced', () => {
    const result = runExamplesAdd(
      project({ 'apps/app/package.json': '{}' }),
      'ai-agent',
      'helper'
    )
    assert.equal(result.refusal, '')
  })

  test('an entity with no generated table zod is refused before anything is written', () => {
    const p = project({
      'apps/app/package.json': '{}',
      '.pikku/db/zod.gen.ts':
        'export const WeeklyChangeoverZ = 1\nexport const JobZ = 2\n',
    })
    const result = runExamplesAdd(p, 'list-query', 'changeover')
    assert.match(result.refusal, /weeklyChangeover/)
    assert.deepEqual(result.written, [])
  })

  test('a scenario naming an rpc nobody has written is refused, not landed', () => {
    const p = project({
      'apps/app/package.json': '{}',
      '.pikku/function/meta.gen.json': JSON.stringify({ somethingElse: {} }),
    })
    const result = runExamplesAdd(p, 'scenario-crud', 'invoice')
    assert.match(result.refusal, /no such rpc/)
    assert.deepEqual(result.written, [])
  })

  test('an unknown name says so instead of writing nothing quietly', () => {
    assert.match(
      runExamplesAdd(project({}), 'nope').refusal,
      /No example named/
    )
  })
})
