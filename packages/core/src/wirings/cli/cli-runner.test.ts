import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'assert'
import { NotFoundError } from '../../errors/errors.js'
import { CorePikkuMiddleware } from '../../types/core.types.js'
import { wireCLI, runCLICommand, pikkuCLIRender } from './cli-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'

describe('CLI Runner', () => {
  let singletonServices: any
  let createSessionServices: any

  beforeEach(() => {
    resetPikkuState()

    singletonServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    }

    createSessionServices = async () => ({})
  })

  afterEach(() => {
    resetPikkuState()
  })

  describe('runCLICommand', () => {
    test('should throw NotFoundError when program not found', async () => {
      pikkuState('cli', 'meta', { programs: {}, renderers: {} })

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
      pikkuState('cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {},
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState('cli', 'programs', {
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
      const testFunc = async (_services: any, _interaction: any, data: any) => {
        receivedData = data
        return { success: true }
      }

      // Setup metadata
      pikkuState('cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                pikkuFuncName: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState('cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [],
          renderers: {},
        },
      })

      pikkuState('function', 'meta', {
        greetFunc: {
          pikkuFuncName: 'greetFunc',
          inputSchemaName: null,
          outputSchemaName: null,
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
        _interaction,
        next
      ) => {
        executionOrder.push('middleware')
        await next()
      }

      const testFunc = async () => {
        executionOrder.push('function')
        return { success: true }
      }

      pikkuState('cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              test: {
                command: 'test',
                pikkuFuncName: 'testFunc',
                positionals: [],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState('cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [testMiddleware],
          renderers: {},
        },
      })

      pikkuState('function', 'meta', {
        testFunc: {
          pikkuFuncName: 'testFunc',
          inputSchemaName: null,
          outputSchemaName: null,
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
        interaction,
        next
      ) => {
        cliContext = interaction.cli
        await next()
      }

      const testFunc = async () => ({ success: true })

      pikkuState('cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              greet: {
                command: 'greet <name>',
                pikkuFuncName: 'greetFunc',
                positionals: [{ name: 'name', required: true }],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState('cli', 'programs', {
        'test-cli': {
          defaultRenderer: undefined,
          middleware: [testMiddleware],
          renderers: {},
        },
      })

      pikkuState('function', 'meta', {
        greetFunc: {
          pikkuFuncName: 'greetFunc',
          inputSchemaName: null,
          outputSchemaName: null,
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

      pikkuState('cli', 'meta', {
        programs: {
          'test-cli': {
            program: 'test-cli',
            commands: {
              secure: {
                command: 'secure',
                pikkuFuncName: 'secureFunc',
                positionals: [],
                options: {},
              },
            },
            options: {},
          },
        },
        renderers: {},
      })

      pikkuState('function', 'meta', {
        secureFunc: {
          pikkuFuncName: 'secureFunc',
          inputSchemaName: null,
          outputSchemaName: null,
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
            createSessionServices,
          }),
        /Authentication required/
      )
    })
  })

  describe('wireCLI', () => {
    test('should register CLI program and commands', () => {
      const greetFunc = async () => 'Hello'

      pikkuState('cli', 'meta', {
        programs: {
          'my-cli': {
            program: 'my-cli',
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

      const programs = pikkuState('cli', 'programs')
      assert.ok(programs['my-cli'])
      assert.strictEqual(programs['my-cli'].middleware.length, 0)
    })

    test('should register CLI with global middleware', () => {
      const middleware: CorePikkuMiddleware = async (_s, _i, next) => {
        await next()
      }

      pikkuState('cli', 'meta', {
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

      const programs = pikkuState('cli', 'programs')
      assert.strictEqual(programs['my-cli'].middleware.length, 1)
      assert.strictEqual(programs['my-cli'].middleware[0], middleware)
    })

    test('should throw error when CLI metadata not found', () => {
      pikkuState('cli', 'meta', { programs: {}, renderers: {} })

      assert.throws(() => {
        wireCLI({
          program: 'nonexistent',
          commands: {},
        })
      }, /CLI metadata not found for program 'nonexistent'/)
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
})
