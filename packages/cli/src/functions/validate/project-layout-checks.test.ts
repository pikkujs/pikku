import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  LAYOUT_CONFIG_DUPLICATE,
  LAYOUT_CONFIG_NOT_AT_ROOT,
  LAYOUT_DB_IN_PACKAGE,
  LAYOUT_EMAILS_IN_PACKAGE,
  LAYOUT_PIKKU_IMPORT_NOT_ROOT,
  runProjectLayoutChecks,
} from './project-layout-checks.js'

const write = async (root: string, rel: string, content: unknown) => {
  const file = join(root, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(
    file,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  )
}

/** The layout e2e/ and docs/MIGRATION.md describe, with a functions package not named functions. */
const goodProject = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-layout-'))
  await write(root, 'package.json', {
    name: 'my-app',
    workspaces: ['packages/*', 'apps/*'],
  })
  await write(root, 'pikku.config.json', {
    base: 'packages/server',
    emailTemplatesDir: 'emails',
  })
  await mkdir(join(root, 'db', 'sqlite'), { recursive: true })
  await mkdir(join(root, 'emails'), { recursive: true })
  // The functions package has no tsconfig and no #pikku imports of its own: the
  // root tsconfig governs it and maps #pikku/* to the generated output.
  await write(root, 'tsconfig.json', {
    compilerOptions: {
      paths: {
        '#pikku/*.js': ['./.pikku/*.ts'],
        '#pikku/*': ['./.pikku/*/index.ts'],
      },
    },
    include: ['packages/server/src'],
  })
  await write(root, 'packages/server/package.json', { name: '@my-app/server' })
  await write(root, 'packages/server/src/index.ts', 'export {}\n')
  return root
}

const ids = (findings: { id: string }[]) => findings.map((f) => f.id).sort()

const withProject = async (
  setup: (root: string) => Promise<string | void>,
  check: (configDir: string, root: string) => Promise<void>
) => {
  const root = await goodProject()
  try {
    const configDir = (await setup(root)) || root
    await check(configDir, root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/** Each bad layout warns, and errors under --strict. */
const assertFlagged = async (configDir: string, id: string) => {
  const normal = await runProjectLayoutChecks(configDir)
  const finding = normal.find((f) => f.id === id)
  assert.ok(finding, `expected ${id}, got ${ids(normal).join(', ')}`)
  assert.equal(finding.severity, 'warn')
  const strict = await runProjectLayoutChecks(configDir, { strict: true })
  assert.equal(strict.find((f) => f.id === id)?.severity, 'error')
  return finding
}

describe('project layout', () => {
  test('the documented layout passes, strict or not', async () => {
    await withProject(
      async () => {},
      async (configDir) => {
        assert.deepEqual(await runProjectLayoutChecks(configDir), [])
        assert.deepEqual(
          await runProjectLayoutChecks(configDir, { strict: true }),
          []
        )
      }
    )
  })

  test('a base with its own config resolves #pikku to its own .pikku', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/pikku.config.json', {})
        await write(root, 'packages/server/package.json', {
          name: '@my-app/server',
          imports: {
            '#pikku/*.js': './.pikku/*.ts',
            '#pikku/*': './.pikku/*/index.ts',
          },
        })
        await write(root, 'pikku.config.json', {
          base: 'packages/server',
          emailTemplatesDir: 'emails',
        })
        await rm(join(root, 'tsconfig.json'))
      },
      async (configDir) => {
        assert.deepEqual(
          await runProjectLayoutChecks(configDir, { strict: true }),
          []
        )
      }
    )
  })

  test('a base with its own config that points #pikku at the root output is flagged', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/pikku.config.json', {})
        await write(root, 'packages/server/package.json', {
          name: '@my-app/server',
          imports: { '#pikku/*': '../../.pikku/*/index.ts' },
        })
        await write(root, 'pikku.config.json', {
          base: 'packages/server',
          emailTemplatesDir: 'emails',
        })
        await rm(join(root, 'tsconfig.json'))
      },
      async (configDir) => {
        const finding = await assertFlagged(
          configDir,
          LAYOUT_PIKKU_IMPORT_NOT_ROOT
        )
        assert.match(finding.fixHint ?? '', /its own pikku.config.json/)
      }
    )
  })

  test('a single-package project keeps everything in one directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-layout-single-'))
    try {
      await write(root, 'package.json', {
        name: 'solo',
        imports: { '#pikku/*': './.pikku/*/index.ts' },
      })
      await write(root, 'pikku.config.json', {})
      await write(root, 'tsconfig.json', {
        compilerOptions: { paths: { '#pikku/*': ['./.pikku/*/index.ts'] } },
      })
      await mkdir(join(root, 'db'), { recursive: true })
      await write(root, 'src/index.ts', 'export {}\n')
      assert.deepEqual(await runProjectLayoutChecks(root, { strict: true }), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a config inside a package is flagged and names the top level', async () => {
    await withProject(
      async (root) => {
        await rm(join(root, 'pikku.config.json'))
        await write(root, 'packages/server/pikku.config.json', {})
        return join(root, 'packages', 'server')
      },
      async (configDir, root) => {
        const finding = await assertFlagged(
          configDir,
          LAYOUT_CONFIG_NOT_AT_ROOT
        )
        assert.match(finding.message, /inside the package packages\/server/)
        assert.ok(finding.message.includes(root))
      }
    )
  })

  test('a workspace of several projects has no single top level', async () => {
    await withProject(
      async (root) => {
        await rm(join(root, 'pikku.config.json'))
        await write(root, 'examples/a/package.json', { name: 'a' })
        await write(root, 'examples/a/pikku.config.json', {})
        await write(root, 'examples/b/package.json', { name: 'b' })
        await write(root, 'examples/b/pikku.config.json', {})
        return join(root, 'examples', 'a')
      },
      async (configDir) => {
        const found = await runProjectLayoutChecks(configDir, { strict: true })
        assert.equal(
          found.some((f) => f.id === LAYOUT_CONFIG_NOT_AT_ROOT),
          false
        )
      }
    )
  })

  test('a second pikku.config.json below the top level is flagged', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/stray/pikku.config.json', {})
      },
      async (configDir) => {
        const finding = await assertFlagged(configDir, LAYOUT_CONFIG_DUPLICATE)
        assert.equal(
          finding.path,
          join(configDir, 'packages', 'stray', 'pikku.config.json')
        )
      }
    )
  })

  test('the base package is not a second config', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/pikku.config.json', {})
      },
      async (configDir) => {
        const found = await runProjectLayoutChecks(configDir, { strict: true })
        assert.equal(
          found.some((f) => f.id === LAYOUT_CONFIG_DUPLICATE),
          false
        )
      }
    )
  })

  test('an addon config, generated pikku.*.json and node_modules are not second configs', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/addon/pikku.config.json', {})
        await write(root, 'packages/addon/types/application-types.d.ts', '')
        await write(root, 'pikku.surface.json', {})
        await write(root, 'node_modules/x/pikku.config.json', {})
        await write(root, '.pikku/x/pikku.config.json', {})
      },
      async (configDir) => {
        assert.deepEqual(
          await runProjectLayoutChecks(configDir, { strict: true }),
          []
        )
      }
    )
  })

  test('db/ inside a functions package with none at the top level is flagged', async () => {
    await withProject(
      async (root) => {
        await rm(join(root, 'db'), { recursive: true })
        await mkdir(join(root, 'packages', 'server', 'db', 'sqlite'), {
          recursive: true,
        })
      },
      async (configDir) => {
        const finding = await assertFlagged(configDir, LAYOUT_DB_IN_PACKAGE)
        assert.match(
          finding.message,
          /db\/ is inside the package packages\/server/
        )
      }
    )
  })

  test('emails/ inside a functions package with none at the top level is flagged', async () => {
    await withProject(
      async (root) => {
        await rm(join(root, 'emails'), { recursive: true })
        await mkdir(join(root, 'packages', 'server', 'emails'), {
          recursive: true,
        })
      },
      async (configDir) => {
        await assertFlagged(configDir, LAYOUT_EMAILS_IN_PACKAGE)
      }
    )
  })

  test('emailTemplatesDir pointing into a functions package is flagged', async () => {
    await withProject(
      async (root) => {
        await write(root, 'pikku.config.json', {
          base: 'packages/server',
          emailTemplatesDir: 'packages/server/emails',
        })
        await mkdir(join(root, 'packages', 'server', 'emails'), {
          recursive: true,
        })
      },
      async (configDir) => {
        await assertFlagged(configDir, LAYOUT_EMAILS_IN_PACKAGE)
      }
    )
  })

  test('a package tsconfig with ../../.pikku paths passes', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/tsconfig.json', {
          compilerOptions: {
            paths: { '#pikku/*': ['../../.pikku/*/index.ts'] },
          },
        })
      },
      async (configDir) => {
        assert.deepEqual(
          await runProjectLayoutChecks(configDir, { strict: true }),
          []
        )
      }
    )
  })

  test('package.json imports through the root package name pass', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/package.json', {
          name: '@my-app/server',
          imports: { '#pikku/*': 'my-app/.pikku/*/index.js' },
        })
      },
      async (configDir) => {
        assert.deepEqual(
          await runProjectLayoutChecks(configDir, { strict: true }),
          []
        )
      }
    )
  })

  test('paths inherited through extends resolve against the file that sets them', async () => {
    await withProject(
      async (root) => {
        await write(root, 'tsconfig.json', { compilerOptions: {} })
        await write(root, 'tsconfig.base.json', {
          compilerOptions: {
            paths: { '#pikku/*': ['./.pikku/*/index.ts'] },
          },
        })
        await write(root, 'packages/server/tsconfig.json', {
          extends: '../../tsconfig.base.json',
        })
      },
      async (configDir) => {
        assert.deepEqual(
          await runProjectLayoutChecks(configDir, { strict: true }),
          []
        )
      }
    )
  })

  test('a root tsconfig mapping #pikku/* into the package is flagged', async () => {
    await withProject(
      async (root) => {
        await write(root, 'tsconfig.json', {
          compilerOptions: {
            paths: { '#pikku/*': ['./packages/server/.pikku/*/index.ts'] },
          },
        })
      },
      async (configDir) => {
        const finding = await assertFlagged(
          configDir,
          LAYOUT_PIKKU_IMPORT_NOT_ROOT
        )
        assert.match(finding.message, /tsconfig\.json paths "#pikku\/\*"/)
      }
    )
  })

  test('a package-level .pikku (the symlink workaround) is flagged with the tsconfig paths fix', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/package.json', {
          name: '@my-app/server',
          imports: {
            '#pikku/*.js': './.pikku/*.ts',
            '#pikku/*': './.pikku/*/index.ts',
          },
        })
      },
      async (configDir) => {
        const finding = await assertFlagged(
          configDir,
          LAYOUT_PIKKU_IMPORT_NOT_ROOT
        )
        assert.match(finding.message, /package\.json imports "#pikku\/\*"/)
        assert.match(
          finding.fixHint,
          /tsconfig paths in tsconfig\.json: "#pikku\/\*\.js": \["\.\/\.pikku\/\*\.ts"\]/
        )
        assert.match(finding.fixHint, /symlink/)
      }
    )
  })

  test('tsconfig paths to a package-level .pikku are flagged', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/tsconfig.json', {
          compilerOptions: { paths: { '#pikku/*': ['./.pikku/*/index.ts'] } },
        })
      },
      async (configDir) => {
        const finding = await assertFlagged(
          configDir,
          LAYOUT_PIKKU_IMPORT_NOT_ROOT
        )
        assert.match(finding.message, /tsconfig\.json paths "#pikku\/\*"/)
        assert.match(
          finding.fixHint,
          /packages\/server\/tsconfig\.json: .*\["\.\.\/\.\.\/\.pikku\/\*\/index\.ts"\]/
        )
      }
    )
  })

  test('package.json imports to a package-level .pikku are flagged', async () => {
    await withProject(
      async (root) => {
        await write(root, 'packages/server/package.json', {
          name: '@my-app/server',
          imports: { '#pikku/*': './.pikku/*/index.js' },
        })
      },
      async (configDir) => {
        const finding = await assertFlagged(
          configDir,
          LAYOUT_PIKKU_IMPORT_NOT_ROOT
        )
        assert.match(finding.message, /package\.json imports "#pikku\/\*"/)
      }
    )
  })
})
