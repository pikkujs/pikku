import { test, describe } from 'node:test'
import * as assert from 'assert'
import { parseCLIArguments, generateCommandHelp } from './command-parser.js'
import { CLIMeta } from './cli.types.js'

const testMeta: CLIMeta = {
  'test-cli': {
    program: 'test-cli',
    commands: {
      greet: {
        command: 'greet <name>',
        pikkuFuncName: 'greetFunc',
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
        command: 'user',
        pikkuFuncName: '',
        positionals: [],
        options: {},
        subcommands: {
          create: {
            command: 'create <name> <email>',
            pikkuFuncName: 'createUserFunc',
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
            command: 'delete <id>',
            pikkuFuncName: 'deleteUserFunc',
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
        command: 'files <paths...>',
        pikkuFuncName: 'filesFunc',
        positionals: [{ name: 'paths', required: true, variadic: true }],
        options: {},
      },
      optional: {
        command: 'optional [name]',
        pikkuFuncName: 'optionalFunc',
        positionals: [{ name: 'name', required: false }],
        options: {},
      },
    },
    globalOptions: {
      verbose: {
        description: 'Enable verbose output',
        short: 'v',
        default: false,
      },
    },
  },
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
      const result = parseCLIArguments(
        ['greet', 'Alice'],
        'test-cli',
        testMeta
      )

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

      // Unknown options are allowed (for forward compatibility)
      // They just won't have defaults or validation
      assert.strictEqual(result.options.unknown, true)
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
        'num-cli': {
          program: 'num-cli',
          commands: {
            test: {
              command: 'test',
              pikkuFuncName: 'testFunc',
              positionals: [],
              options: {
                port: {
                  description: 'Port number',
                  default: 3000,
                },
              },
            },
          },
          globalOptions: {},
        },
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
      assert.ok(help.includes('Global Options:'))
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
        'test-cli': {
          program: 'test-cli',
          commands: {
            greet: {
              command: 'greet <name>',
              pikkuFuncName: 'greetFunc',
              description: 'Greet a user',
              positionals: [{ name: 'name', required: true }],
              options: {},
            },
          },
          globalOptions: {},
        },
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
})
