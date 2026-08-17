import { test, describe } from 'node:test'
import * as assert from 'assert'
import { parseCLIArguments, generateCommandHelp } from './command-parser.js'
import type { CLIMeta } from './cli.types.js'

const testMeta: CLIMeta = {
  programs: {
    'test-cli': {
      program: 'test-cli',
      options: {
        verbose: {
          description: 'Enable verbose output',
          short: 'v',
          default: false,
        },
      },
      commands: {
        greet: {
          parameters: '<name>',
          pikkuFuncId: 'greetFunc',
          positionals: [{ name: 'name', required: true }],
          options: {
            loud: {
              description: 'Use loud greeting',
              short: 'l',
              default: false,
            },
          },
        },
        user: {
          pikkuFuncId: '',
          positionals: [],
          options: {},
          subcommands: {
            create: {
              parameters: '<name> <email>',
              pikkuFuncId: 'createUserFunc',
              positionals: [
                { name: 'name', required: true },
                { name: 'email', required: true },
              ],
              options: {
                role: {
                  description: 'User role',
                  short: 'r',
                  default: 'user',
                  choices: ['admin', 'user', 'guest'],
                },
              },
            },
            delete: {
              parameters: '<id>',
              pikkuFuncId: 'deleteUserFunc',
              positionals: [{ name: 'id', required: true }],
              options: {
                force: {
                  description: 'Force delete',
                  short: 'f',
                  default: false,
                },
              },
            },
          },
        },
        files: {
          parameters: '<paths...>',
          pikkuFuncId: 'filesFunc',
          positionals: [{ name: 'paths', required: true, variadic: true }],
          options: {},
        },
        optional: {
          parameters: '[name]',
          pikkuFuncId: 'optionalFunc',
          positionals: [{ name: 'name', required: false }],
          options: {},
        },
        serve: {
          pikkuFuncId: 'serveFunc',
          positionals: [],
          options: {
            browser: {
              description: 'Open a browser',
              default: true,
            },
            port: {
              description: 'Port to listen on',
              default: 8080,
            },
          },
        },
        deploy: {
          pikkuFuncId: 'deployFunc',
          positionals: [],
          options: {
            token: {
              description: 'Auth token',
              short: 'k',
              type: 'string',
            },
            tags: {
              description: 'Tags to include',
              short: 't',
              type: 'string[]',
            },
            note: {
              description: 'Free-form note',
            },
            dryRun: {
              description: 'Report without deploying',
              type: 'boolean',
              short: 'D',
            },
          },
        },
      },
    },
  },
  renderers: {},
}

describe('Command Parser', () => {
  describe('parseCLIArguments', () => {
    test('should parse simple command with required positional', () => {
      const result = parseCLIArguments(['greet', 'Alice'], 'test-cli', testMeta)

      assert.strictEqual(result.program, 'test-cli')
      assert.deepStrictEqual(result.commandPath, ['greet'])
      assert.deepStrictEqual(result.positionals, { name: 'Alice' })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should parse command with boolean flag', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '--loud'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.positionals, { name: 'Alice' })
      assert.deepStrictEqual(result.options, { loud: true, verbose: false })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should turn a boolean option off with --no-<flag>', () => {
      const result = parseCLIArguments(
        ['serve', '--no-browser'],
        'test-cli',
        testMeta
      )

      assert.strictEqual(result.options.browser, false)
      assert.strictEqual(result.errors.length, 0)
      assert.deepStrictEqual(
        result.warnings ?? [],
        [],
        '--no-browser is the negation of a known option, not an unknown one'
      )
    })

    test('should leave a boolean option at its default when not negated', () => {
      const result = parseCLIArguments(['serve'], 'test-cli', testMeta)

      assert.strictEqual(result.options.browser, true)
    })

    test('should not consume the next argument when negating', () => {
      const result = parseCLIArguments(
        ['serve', '--no-browser', '--port', '4077'],
        'test-cli',
        testMeta
      )

      assert.strictEqual(result.options.browser, false)
      assert.strictEqual(result.options.port, 4077)
    })

    test('should still warn about an unknown --no-<flag>', () => {
      const result = parseCLIArguments(
        ['serve', '--no-telemetry'],
        'test-cli',
        testMeta
      )

      assert.ok(
        (result.warnings ?? []).length > 0,
        'negating an option that does not exist is a typo, not a feature'
      )
    })

    test('should parse command with short flag', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '-l'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options, { loud: true, verbose: false })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should parse command with option value using space', () => {
      const result = parseCLIArguments(
        ['user', 'create', 'Bob', 'bob@example.com', '--role', 'admin'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.commandPath, ['user', 'create'])
      assert.deepStrictEqual(result.positionals, {
        name: 'Bob',
        email: 'bob@example.com',
      })
      assert.deepStrictEqual(result.options, { role: 'admin', verbose: false })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should parse command with option value using equals', () => {
      const result = parseCLIArguments(
        ['user', 'create', 'Bob', 'bob@example.com', '--role=admin'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options, { role: 'admin', verbose: false })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should parse command with short option and value', () => {
      const result = parseCLIArguments(
        ['user', 'create', 'Bob', 'bob@example.com', '-r', 'admin'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options, { role: 'admin', verbose: false })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should apply default option values', () => {
      const result = parseCLIArguments(['greet', 'Alice'], 'test-cli', testMeta)

      assert.deepStrictEqual(result.options, { loud: false, verbose: false })
    })

    test('should parse subcommands', () => {
      const result = parseCLIArguments(
        ['user', 'create', 'Alice', 'alice@example.com'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.commandPath, ['user', 'create'])
      assert.deepStrictEqual(result.positionals, {
        name: 'Alice',
        email: 'alice@example.com',
      })
    })

    test('should report missing subcommand for a group node with no func', () => {
      const result = parseCLIArguments(['user'], 'test-cli', testMeta)

      assert.deepStrictEqual(result.commandPath, ['user'])
      assert.ok(
        result.errors.some((error) => error.startsWith('Missing subcommand:')),
        `expected a "Missing subcommand:" error, got: ${JSON.stringify(result.errors)}`
      )
    })

    test('should not flag a runnable command as a missing subcommand', () => {
      const result = parseCLIArguments(['greet', 'Alice'], 'test-cli', testMeta)

      assert.deepStrictEqual(result.commandPath, ['greet'])
      assert.strictEqual(result.errors.length, 0)
    })

    test('should parse variadic positionals', () => {
      const result = parseCLIArguments(
        ['files', 'file1.txt', 'file2.txt', 'file3.txt'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.positionals, {
        paths: ['file1.txt', 'file2.txt', 'file3.txt'],
      })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should parse optional positionals when provided', () => {
      const result = parseCLIArguments(
        ['optional', 'Alice'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.positionals, { name: 'Alice' })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should handle missing optional positionals', () => {
      const result = parseCLIArguments(['optional'], 'test-cli', testMeta)

      assert.deepStrictEqual(result.positionals, {})
      assert.strictEqual(result.errors.length, 0)
    })

    test('should handle global options', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '--verbose'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options, { loud: false, verbose: true })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should combine multiple short flags', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '-lv'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options, { loud: true, verbose: true })
      assert.strictEqual(result.errors.length, 0)
    })

    test('should report error for missing required positional', () => {
      const result = parseCLIArguments(['greet'], 'test-cli', testMeta)

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Missing required argument: name'))
    })

    test('should report error for invalid choice', () => {
      const result = parseCLIArguments(
        ['user', 'create', 'Bob', 'bob@example.com', '--role', 'invalid'],
        'test-cli',
        testMeta
      )

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Invalid value'))
    })

    test('should report error for unknown option', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '--unknown'],
        'test-cli',
        testMeta
      )

      assert.strictEqual(result.options.unknown, true)
      assert.strictEqual(result.errors.length, 0)
    })

    test('should report error for unknown short flag', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '-x'],
        'test-cli',
        testMeta
      )

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Unknown option: -x'))
    })

    test('should report error for extra positional arguments', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', 'Bob'],
        'test-cli',
        testMeta
      )

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Unexpected arguments'))
    })

    test('should report error for unknown command', () => {
      const result = parseCLIArguments(['unknown'], 'test-cli', testMeta)

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Unknown command'))
    })

    test('should report error for nonexistent program', () => {
      const result = parseCLIArguments(['test'], 'nonexistent', testMeta)

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Program not found'))
    })

    test('should parse number values correctly', () => {
      const metaWithNumber: CLIMeta = {
        programs: {
          'num-cli': {
            program: 'num-cli',
            options: {},
            commands: {
              test: {
                pikkuFuncId: 'testFunc',
                positionals: [],
                options: {
                  port: {
                    description: 'Port number',
                    default: 3000,
                  },
                },
              },
            },
          },
        },
        renderers: {},
      }

      const result = parseCLIArguments(
        ['test', '--port', '8080'],
        'num-cli',
        metaWithNumber
      )

      assert.strictEqual(result.options.port, 8080)
      assert.strictEqual(typeof result.options.port, 'number')
    })

    test('should parse boolean values correctly', () => {
      const result = parseCLIArguments(
        ['greet', 'Alice', '--loud', 'true'],
        'test-cli',
        testMeta
      )

      assert.strictEqual(result.options.loud, true)
    })

    test('should handle empty variadic positionals when required', () => {
      const result = parseCLIArguments(['files'], 'test-cli', testMeta)

      assert.ok(result.errors.length > 0)
      assert.ok(result.errors[0].includes('Missing required argument: paths'))
    })
  })

  describe('generateCommandHelp', () => {
    test('should generate help for program root', () => {
      const help = generateCommandHelp('test-cli', testMeta)

      assert.ok(help.includes('Usage: test-cli <command>'))
      assert.ok(help.includes('Commands:'))
      assert.ok(help.includes('greet'))
      assert.ok(help.includes('Options:'))
      assert.ok(help.includes('--verbose'))
    })

    test('should generate help for specific command', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['greet'])

      assert.ok(help.includes('Usage: test-cli greet'))
      assert.ok(help.includes('<name>'))
      assert.ok(help.includes('--loud'))
      assert.ok(help.includes('Use loud greeting'))
    })

    test('should generate help for subcommand', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['user', 'create'])

      assert.ok(help.includes('Usage: test-cli user create'))
      assert.ok(help.includes('<name>'))
      assert.ok(help.includes('<email>'))
      assert.ok(help.includes('--role'))
    })

    test('should show command description if available', () => {
      const metaWithDesc: CLIMeta = {
        programs: {
          'test-cli': {
            program: 'test-cli',
            options: {},
            commands: {
              greet: {
                parameters: '<name>',
                pikkuFuncId: 'greetFunc',
                description: 'Greet a user',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
          },
        },
        renderers: {},
      }

      const help = generateCommandHelp('test-cli', metaWithDesc, ['greet'])

      assert.ok(help.includes('Greet a user'))
    })

    test('should show option defaults in help', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['greet'])

      assert.ok(help.includes('(default: false)'))
    })

    test('should show option choices in help', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['user', 'create'])

      assert.ok(help.includes('[choices: admin, user, guest]'))
    })

    test('should show subcommands in help', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['user'])

      assert.ok(help.includes('Subcommands:'))
      assert.ok(help.includes('create'))
      assert.ok(help.includes('delete'))
    })

    test('should show variadic positionals in help', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['files'])

      assert.ok(help.includes('paths...'))
      assert.ok(help.includes('<required>'))
    })

    test('should show optional positionals in help', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['optional'])

      assert.ok(help.includes('name'))
      assert.ok(help.includes('[optional]'))
    })

    test('should return error for nonexistent program', () => {
      const help = generateCommandHelp('nonexistent', testMeta)

      assert.ok(help.includes('Program not found'))
    })

    test('should return error for nonexistent command', () => {
      const help = generateCommandHelp('test-cli', testMeta, ['nonexistent'])

      assert.ok(help.includes('Unknown command'))
    })
  })

  describe('camelCase ↔ kebab-case options', () => {
    const kebabMeta: CLIMeta = {
      programs: {
        'test-cli': {
          program: 'test-cli',
          options: {},
          commands: {
            deploy: {
              pikkuFuncId: 'deployFunc',
              positionals: [],
              options: {
                autoApply: {
                  description: 'Deploy without the confirmation prompt',
                  default: false,
                },
                apiUrl: { description: 'Override the API URL' },
                token: { description: 'Auth token', required: true },
              },
            },
          },
        },
      },
      renderers: {},
    }

    test('renders camelCase option keys as kebab-case in help', () => {
      const help = generateCommandHelp('test-cli', kebabMeta, ['deploy'])

      assert.ok(help.includes('--auto-apply'), 'expected --auto-apply')
      assert.ok(help.includes('--api-url'), 'expected --api-url')
      assert.ok(!help.includes('--autoApply'), 'should not show camelCase')
      assert.ok(!help.includes('--apiUrl'), 'should not show camelCase')
    })

    test('accepts the kebab-case form and maps it to the camelCase field', () => {
      const result = parseCLIArguments(
        ['deploy', '--auto-apply', '--api-url', 'https://x'],
        'test-cli',
        kebabMeta
      )

      assert.strictEqual(result.options.autoApply, true)
      assert.strictEqual(result.options.apiUrl, 'https://x')
    })

    test('still accepts the camelCase form (back-compat)', () => {
      const result = parseCLIArguments(
        ['deploy', '--autoApply', '--apiUrl', 'https://x'],
        'test-cli',
        kebabMeta
      )

      assert.strictEqual(result.options.autoApply, true)
      assert.strictEqual(result.options.apiUrl, 'https://x')
    })

    test('renders missing-required-option errors in kebab-case', () => {
      const result = parseCLIArguments(['deploy'], 'test-cli', kebabMeta)

      assert.ok(
        result.errors.some((e) => e.includes('--token')),
        'expected a missing --token error'
      )
    })
  })

  describe('unknown long options', () => {
    const listMeta: CLIMeta = {
      programs: {
        'test-cli': {
          program: 'test-cli',
          options: {},
          commands: {
            list: {
              pikkuFuncId: 'listFunc',
              positionals: [],
              options: {
                section: { description: 'Section to list', default: 'all' },
                autoApply: {
                  description: 'Apply automatically',
                  default: false,
                },
              },
            },
          },
        },
      },
      renderers: {},
    }

    test('warns (but does not error) on an unknown --opt value option', () => {
      const result = parseCLIArguments(
        ['list', '--sektion', 'functions'],
        'test-cli',
        listMeta
      )

      assert.strictEqual(result.errors.length, 0, 'should stay non-fatal')
      assert.strictEqual(result.warnings.length, 1)
      assert.ok(
        result.warnings[0].startsWith('Unknown option: --sektion (ignored)'),
        `unexpected warning: ${result.warnings[0]}`
      )
      assert.strictEqual(result.options.sektion, 'functions')
      assert.strictEqual(result.options.section, 'all')
    })

    test('warns on an unknown --opt=value option', () => {
      const result = parseCLIArguments(
        ['list', '--sektion=functions'],
        'test-cli',
        listMeta
      )

      assert.strictEqual(result.errors.length, 0)
      assert.strictEqual(result.warnings.length, 1)
      assert.ok(
        result.warnings[0].startsWith('Unknown option: --sektion (ignored)'),
        `unexpected warning: ${result.warnings[0]}`
      )
      assert.strictEqual(result.options.sektion, 'functions')
    })

    test('suggests a near-miss option name', () => {
      const result = parseCLIArguments(
        ['list', '--sektion'],
        'test-cli',
        listMeta
      )

      assert.ok(
        result.warnings[0].includes('Did you mean --section?'),
        `expected a suggestion, got: ${result.warnings[0]}`
      )
    })

    test('suggests the kebab-case rendering of a camelCase option', () => {
      const result = parseCLIArguments(
        ['list', '--auto-aply'],
        'test-cli',
        listMeta
      )

      assert.ok(
        result.warnings[0].includes('Did you mean --auto-apply?'),
        `expected a suggestion, got: ${result.warnings[0]}`
      )
    })

    test('omits the suggestion when nothing is close', () => {
      const result = parseCLIArguments(
        ['list', '--completely-different'],
        'test-cli',
        listMeta
      )

      assert.strictEqual(
        result.warnings[0],
        'Unknown option: --completely-different (ignored)'
      )
    })

    test('does not warn for a known option (either casing)', () => {
      const kebab = parseCLIArguments(
        ['list', '--section', 'functions', '--auto-apply'],
        'test-cli',
        listMeta
      )
      assert.deepStrictEqual(kebab.warnings, [])
      assert.strictEqual(kebab.options.section, 'functions')

      const camel = parseCLIArguments(
        ['list', '--autoApply'],
        'test-cli',
        listMeta
      )
      assert.deepStrictEqual(camel.warnings, [])
    })

    test('does not warn for --help', () => {
      const result = parseCLIArguments(['list', '--help'], 'test-cli', listMeta)

      assert.deepStrictEqual(result.warnings, [])
    })

    test('unknown short flags still error, not warn', () => {
      const result = parseCLIArguments(['list', '-x'], 'test-cli', listMeta)

      assert.ok(result.errors.some((e) => e.includes('Unknown option: -x')))
      assert.deepStrictEqual(result.warnings, [])
    })
    describe('short-flag cluster is bounded (DoS)', () => {
      test('a huge short-flag cluster yields a single error, not one per char', () => {
        const huge = '-' + 'a'.repeat(200_000)
        const result = parseCLIArguments(
          ['greet', 'Alice', huge],
          'test-cli',
          testMeta
        )
        const clusterErrors = result.errors.filter((e) =>
          e.includes('Unknown option')
        )
        // Without the cap this would be ~200k errors (one per character).
        assert.ok(
          clusterErrors.length <= 2,
          `expected the oversized cluster to collapse to a single error, got ${clusterErrors.length}`
        )
        assert.ok(result.errors.some((e) => e.includes('too long')))
      })
    })
  })

  describe('the option spec drives value consumption', () => {
    test('a string option takes the next token verbatim, even leading with a dash', () => {
      const result = parseCLIArguments(
        ['deploy', '--token', '-PumP_kL0'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.token, '-PumP_kL0')
    })

    test('an untyped option with no boolean/number default is still a string', () => {
      const result = parseCLIArguments(
        ['deploy', '--note', '-dash-leading'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.note, '-dash-leading')
    })

    test('a comma list into an array option splits, trims and drops blanks', () => {
      const result = parseCLIArguments(
        ['deploy', '--tags', 'alpha, beta ,,gamma'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.deepStrictEqual(result.options.tags, ['alpha', 'beta', 'gamma'])
    })

    test('an array option splits the --opt=value form too', () => {
      const result = parseCLIArguments(
        ['deploy', '--tags=alpha,beta'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options.tags, ['alpha', 'beta'])
    })

    test('an array option consumes exactly one token', () => {
      const result = parseCLIArguments(
        ['deploy', '--tags', 'alpha,beta', '--note', 'hello'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.deepStrictEqual(result.options.tags, ['alpha', 'beta'])
      assert.strictEqual(result.options.note, 'hello')
    })

    test('a repeated array option accumulates', () => {
      const result = parseCLIArguments(
        ['deploy', '--tags', 'alpha', '--tags', 'beta,gamma'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options.tags, ['alpha', 'beta', 'gamma'])
    })

    test('an array option takes a dash-leading value verbatim', () => {
      const result = parseCLIArguments(
        ['deploy', '--tags', '-alpha,beta'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.deepStrictEqual(result.options.tags, ['-alpha', 'beta'])
    })

    test('a comma in a non-array option stays one literal string', () => {
      const result = parseCLIArguments(
        ['deploy', '--note', 'alpha,beta'],
        'test-cli',
        testMeta
      )

      assert.strictEqual(result.options.note, 'alpha,beta')
    })

    test('a boolean option does not consume a following non-literal token', () => {
      const result = parseCLIArguments(
        ['deploy', '--dry-run', '--note', 'hello'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.dryRun, true)
      assert.strictEqual(result.options.note, 'hello')
    })

    test('boolean options take an explicit literal instead of leaking positionals', () => {
      const devMeta: CLIMeta = {
        programs: {
          'dev-cli': {
            program: 'dev-cli',
            options: {},
            commands: {
              dev: {
                pikkuFuncId: 'devFunc',
                positionals: [],
                options: {
                  port: {
                    description: 'Port for the dev server',
                    default: '3000',
                    short: 'p',
                  },
                  watch: {
                    description: 'Watch for file changes and regenerate',
                    default: true,
                  },
                  hmr: {
                    description: 'Enable hot module reload',
                    default: true,
                  },
                },
              },
            },
          },
        },
        renderers: {},
      }

      const result = parseCLIArguments(
        ['dev', '--port', '4077', '--watch', 'false', '--hmr', 'false'],
        'dev-cli',
        devMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.deepStrictEqual(result.positionals, {})
      assert.strictEqual(result.options.port, '4077')
      assert.strictEqual(result.options.watch, false)
      assert.strictEqual(result.options.hmr, false)
    })

    test('a typed boolean option with no default takes an explicit literal', () => {
      const result = parseCLIArguments(
        ['deploy', '--dry-run', 'false', '--note', 'hello'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.dryRun, false)
      assert.strictEqual(result.options.note, 'hello')
    })

    test('a boolean option takes an explicit literal in the --opt=value form', () => {
      const result = parseCLIArguments(
        ['deploy', '--dry-run=false'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.dryRun, false)
    })

    test('a boolean short flag takes an explicit literal', () => {
      const result = parseCLIArguments(
        ['deploy', '-D', 'false'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.dryRun, false)
    })

    test('a short flag follows its option spec for dash-leading values', () => {
      const result = parseCLIArguments(
        ['deploy', '-k', '-PumP_kL0'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.errors, [])
      assert.strictEqual(result.options.token, '-PumP_kL0')
    })

    test('a short flag for an array option splits on commas', () => {
      const result = parseCLIArguments(
        ['deploy', '-t', 'alpha,beta'],
        'test-cli',
        testMeta
      )

      assert.deepStrictEqual(result.options.tags, ['alpha', 'beta'])
    })

    test('a boolean short flag in a cluster does not swallow the next token', () => {
      const result = parseCLIArguments(
        ['deploy', '-D', 'positional-would-error'],
        'test-cli',
        testMeta
      )

      assert.strictEqual(result.options.dryRun, true)
      assert.ok(
        result.errors.some((e) => e.includes('Unexpected arguments')),
        `expected the token to stay a positional, got: ${result.errors.join(', ')}`
      )
    })
  })
})
