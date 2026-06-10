import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { NotFoundError } from '../../errors/errors.js'
import type { CorePikkuMiddleware } from '../../types/core.types.js'
import {
  CLIError,
  executeCLI,
  wireCLI,
  runCLICommand,
  pikkuCLIRender,
} from './cli-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'

describe('CLI Runner', () => {
  let singletonServices: any
  let createWireServices: any

  beforeEach(() => {
    resetPikkuState()

    singletonServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    }

    createWireServices = async () => ({})
  })

  afterEach(() => {
    resetPikkuState()
  })

  describe('runCLICommand', () => {
    test('should throw NotFoundError when program not found', async () => {
      pikkuState(null, 'cli', 'meta', { programs: {}, renderers: {} })

      await assert.rejects(
        async () =>
          runCLICommand({
            program: 'nonexistent',
            commandPath: ['test'],
            data: {},
            singletonServices,
          }),
        NotFoundError
      )
    })

    test('should throw NotFoundError when command not found', async () => {
      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                pikkuFuncId: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState(null, 'cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [],
          renderers: {},
        },
      })

      await assert.rejects(
        async () =>
          runCLICommand({
            program: 'test-cli',
            commandPath: ['nonexistent'],
            data: {},
            singletonServices,
          }),
        NotFoundError
      )
    })

    test('should execute command function with merged data', async () => {
      let receivedData: any
      const testFunc = async (_services: any, data: any, _wire: any) => {
        receivedData = data
        return { success: true }
      }

      // Setup metadata
      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                pikkuFuncId: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState(null, 'cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [],
          renderers: {},
        },
      })

      pikkuState(null, 'function', 'meta', {
        greetFunc: {
          pikkuFuncId: 'greetFunc',
          inputSchemaName: null,
          outputSchemaName: null,
          sessionless: true,
        },
      })

      addFunction('greetFunc', { func: testFunc, auth: false })

      const result = await runCLICommand({
        program: 'test-cli',
        commandPath: ['greet'],
        data: { name: 'Alice', loud: true },
        singletonServices,
      })

      assert.strictEqual(result.success, true)
      assert.deepStrictEqual(receivedData, { name: 'Alice', loud: true })
    })

    test('should run middleware before function execution', async () => {
      const executionOrder: string[] = []

      const testMiddleware: CorePikkuMiddleware = async (
        _services,
        _wire,
        next
      ) => {
        executionOrder.push('middleware')
        await next()
      }

      const testFunc = async () => {
        executionOrder.push('function')
        return { success: true }
      }

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              test: {
                command: 'test',
                pikkuFuncId: 'testFunc',
                positionals: [],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState(null, 'cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [testMiddleware],
          renderers: {},
        },
      })

      pikkuState(null, 'function', 'meta', {
        testFunc: {
          pikkuFuncId: 'testFunc',
          inputSchemaName: null,
          outputSchemaName: null,
          sessionless: true,
        },
      })

      addFunction('testFunc', { func: testFunc, auth: false })

      await runCLICommand({
        program: 'test-cli',
        commandPath: ['test'],
        data: {},
        singletonServices,
      })

      assert.deepStrictEqual(executionOrder, ['middleware', 'function'])
    })

    test.skip('should provide CLI context to middleware', async () => {
      let cliContext: any = null

      const testMiddleware: CorePikkuMiddleware = async (
        _services,
        wire,
        next
      ) => {
        cliContext = wire.cli
        await next()
      }

      const testFunc = async () => ({ success: true })

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                pikkuFuncId: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState(null, 'cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [testMiddleware],
          renderers: {},
        },
      })

      pikkuState(null, 'function', 'meta', {
        greetFunc: {
          pikkuFuncId: 'greetFunc',
          inputSchemaName: null,
          outputSchemaName: null,
          sessionless: true,
        },
      })

      addFunction('greetFunc', { func: testFunc, auth: false })

      await runCLICommand({
        program: 'test-cli',
        commandPath: ['greet'],
        data: { name: 'Alice' },
        singletonServices,
      })

      assert.ok(cliContext, 'CLI context should be set by middleware')
      assert.strictEqual(cliContext.program, 'test-cli')
      assert.deepStrictEqual(cliContext.command, ['greet'])
      assert.deepStrictEqual(cliContext.data, { name: 'Alice' })
    })

    test('should throw error when auth required but no session', async () => {
      const testFunc = async () => ({ success: true })

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              secure: {
                command: 'secure',
                pikkuFuncId: 'secureFunc',
                positionals: [],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState(null, 'function', 'meta', {
        secureFunc: {
          pikkuFuncId: 'secureFunc',
          inputSchemaName: null,
          outputSchemaName: null,
          sessionless: true,
        },
      })

      addFunction('secureFunc', { func: testFunc, auth: true })

      await assert.rejects(
        async () =>
          runCLICommand({
            program: 'test-cli',
            commandPath: ['secure'],
            data: {},
            singletonServices,
            createWireServices,
          }),
        /Authentication required/
      )
    })
  })

  describe('wireCLI', () => {
    test('should register CLI program and commands', () => {
      const greetFunc = async () => 'Hello'

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'my-cli': {
            program: 'my-cli',
            commands: {
              greet: {
                command: 'greet <name>',
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
            },
            options: {},
          },
        },
        renderers: {},
      })

      wireCLI({
        program: 'my-cli',
        commands: {
          greet: greetFunc,
        },
      })

      const programs = pikkuState(null, 'cli', 'programs')
      assert.ok(programs['my-cli'])
      assert.strictEqual(programs['my-cli'].middleware.length, 0)
    })

    test('should register CLI with global middleware', () => {
      const middleware: CorePikkuMiddleware = async (_s, _i, next) => {
        await next()
      }

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'my-cli': {
            program: 'my-cli',
            commands: {},
            options: {},
          },
        },
        renderers: {},
      })

      wireCLI({
        program: 'my-cli',
        commands: {},
        middleware: [middleware],
      })

      const programs = pikkuState(null, 'cli', 'programs')
      assert.strictEqual(programs['my-cli'].middleware.length, 1)
      assert.strictEqual(programs['my-cli'].middleware[0], middleware)
    })

    test('should skip when CLI metadata not found', () => {
      pikkuState(null, 'cli', 'meta', { programs: {}, renderers: {} })

      wireCLI({
        program: 'nonexistent',
        commands: {},
      })

      const programs = pikkuState(null, 'cli', 'programs')
      assert.strictEqual(programs['nonexistent'], undefined)
    })
  })

  describe('pikkuCLIRender', () => {
    test('should create CLI renderer function', () => {
      const renderer = pikkuCLIRender((services, data) => {
        console.log(data)
      })

      assert.strictEqual(typeof renderer, 'function')
    })

    test('should preserve renderer function behavior', async () => {
      let receivedData: any
      const renderer = pikkuCLIRender((services, data) => {
        receivedData = data
      })

      await renderer({} as any, { test: 'value' })
      assert.deepStrictEqual(receivedData, { test: 'value' })
    })
  })

  describe('executeCLI', () => {
    test('should require args to be provided', async () => {
      await assert.rejects(
        () =>
          executeCLI({
            programName: 'test-cli',
            createSingletonServices: async () => singletonServices,
          }),
        /CLI arguments are required/
      )
    })

    test('should throw CLIError when the program is missing from cli metadata', async () => {
      await assert.rejects(
        () =>
          executeCLI({
            programName: 'test-cli',
            args: [],
            createSingletonServices: async () => singletonServices,
          }),
        /CLI program "test-cli" not found/
      )
    })

    test('should print help and return when --help is requested', async () => {
      const logs: string[] = []
      const originalLog = console.log
      console.log = (message?: any) => {
        logs.push(String(message))
      }

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            description: 'Test CLI',
            commands: {
              greet: {
                command: 'greet <name>',
                description: 'Greets someone',
                pikkuFuncId: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      try {
        await executeCLI({
          programName: 'test-cli',
          args: ['--help'],
          createSingletonServices: async () => singletonServices,
        })
      } finally {
        console.log = originalLog
      }

      assert.ok(logs[0]?.includes('test-cli'))
      assert.ok(logs[0]?.includes('greet'))
    })

    test('should show help and throw CLIError for unknown commands', async () => {
      const logs: string[] = []
      const originalLog = console.log
      console.log = (message?: any) => {
        logs.push(String(message))
      }

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                description: 'Greets someone',
                pikkuFuncId: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      try {
        await assert.rejects(
          () =>
            executeCLI({
              programName: 'test-cli',
              args: ['unknown'],
              createSingletonServices: async () => singletonServices,
            }),
          (error: any) => {
            assert.ok(error instanceof CLIError)
            assert.strictEqual(error.message, 'Unknown command')
            assert.strictEqual(error.exitCode, 1)
            return true
          }
        )
      } finally {
        console.log = originalLog
      }

      assert.ok(logs[0]?.includes('test-cli'))
    })

    test('should print parse errors and throw CLIError', async () => {
      const errors: string[] = []
      const originalError = console.error
      console.error = (message?: any) => {
        errors.push(String(message))
      }

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                pikkuFuncId: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      try {
        await assert.rejects(
          () =>
            executeCLI({
              programName: 'test-cli',
              args: ['greet'],
              createSingletonServices: async () => singletonServices,
            }),
          (error: any) => {
            assert.ok(error instanceof CLIError)
            assert.ok(error.message.includes('Missing required argument: name'))
            return true
          }
        )
      } finally {
        console.error = originalError
      }

      assert.strictEqual(errors[0], 'Errors:')
      assert.ok(errors[1]?.includes('Missing required argument: name'))
    })

    test('should create config and singleton services with parsed data and execute the command', async () => {
      let receivedConfigData: any
      let receivedConfig: any
      let executed = false

      pikkuState(null, 'cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
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
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState(null, 'cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [],
          renderers: {},
        },
      })

      pikkuState(null, 'function', 'meta', {
        greetFunc: {
          pikkuFuncId: 'greetFunc',
          inputSchemaName: null,
          outputSchemaName: null,
          sessionless: true,
          sessionless: true,
        },
      })

      addFunction('greetFunc', {
        func: async () => {
          executed = true
          return undefined
        },
        auth: false,
      })

      await executeCLI({
        programName: 'test-cli',
        args: ['greet', 'Alice', '--loud'],
        createConfig: async (_variables, data) => {
          receivedConfigData = data
          return { config: true }
        },
        createSingletonServices: async (config) => {
          receivedConfig = config
          return singletonServices
        },
      })

      assert.deepStrictEqual(receivedConfigData, {
        name: 'Alice',
        loud: true,
      })
      assert.deepStrictEqual(receivedConfig, { config: true })
      assert.strictEqual(executed, true)
      assert.strictEqual(
        pikkuState(null, 'package', 'singletonServices'),
        singletonServices
      )
    })
  })
})
